package orders

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

var (
	errWorkflowConflict  = errors.New("action is unavailable in the current order state")
	errWorkflowForbidden = errors.New("this action is outside your assignment")
	errWorkflowInput     = errors.New("action requires valid shipment or receipt details")
	errHotSpotRoute      = errors.New("hotspot has no district store route")
)

type ActionInput struct {
	WarehouseID      *string `json:"warehouse_store_id"`
	RiderID          *string `json:"rider_id"`
	QuantityReceived *int32  `json:"quantity_received"`
	QuantityIssued   *int32  `json:"quantity_issued"`
	DiscrepancyNote  *string `json:"discrepancy_note"`
	DeliveryNote     *string `json:"delivery_note"`
}

func (r *Repository) reportStockout(ctx context.Context, actorID, hotSpotID, condomID, unitID string, quantity int32, comment *string) (Order, error) {
	var order Order
	err := pgx.BeginFunc(ctx, r.db, func(tx pgx.Tx) error {
		if err := checkOrderable(ctx, tx, condomID); err != nil {
			return err
		}
		var err error
		order, err = scanOrder(tx.QueryRow(ctx, `
			INSERT INTO orders (hot_spot_id, condom_id, unit_of_measure_id, quantity_needed,
				ordered_by_id, ordered_for_store_id, ordered_from_store_id, order_status, comment)
			SELECT route.hot_spot_id, $2, $3, $4, $5, route.store_id, route.store_id, 'queued', $6
			FROM order_hot_spot_routes route JOIN stores s ON s.id = route.store_id
			WHERE route.hot_spot_id = $1 AND s.store_type = 'district'
			RETURNING `+columns, hotSpotID, condomID, unitID, quantity, actorID, comment))
		if errors.Is(err, pgx.ErrNoRows) {
			return errHotSpotRoute
		}
		if err != nil {
			return err
		}
		return addEvent(ctx, tx, order, actorID, "stockout_reported", &order.OrderedFromStoreID, nil)
	})
	return order, err
}

func assigned(id *string, expected string) bool {
	return id != nil && *id == expected
}

func (r *Repository) act(ctx context.Context, access scope, id, action string, input ActionInput) (Order, error) {
	var result Order
	err := pgx.BeginFunc(ctx, r.db, func(tx pgx.Tx) error {
		if action == "receive" {
			// Receipt also confirms the held hotspot order. Lock it before its replenishment, the same
			// order request-replenishment takes, so the two cannot deadlock.
			if _, err := tx.Exec(ctx, `SELECT FROM orders WHERE id =
				(SELECT parent_order_id FROM orders WHERE id = $1) FOR UPDATE`, id); err != nil {
				return err
			}
		}
		order, err := scanOrder(tx.QueryRow(ctx, `SELECT `+columns+` FROM orders WHERE `+visibleOrders+
			` AND id = $5 FOR UPDATE`, access.allStores, access.storeID, access.hotSpotID, access.userID, id))
		if err != nil {
			return err
		}
		if order.HotSpotID == nil && order.ParentOrderID == nil {
			return errWorkflowConflict
		}
		expectedStore := order.OrderedFromStoreID
		if action == "receive" {
			expectedStore = order.OrderedForStoreID
		}
		if action == "deliver" {
			if !access.allStores && !assigned(order.RiderID, access.userID) {
				return errWorkflowForbidden
			}
		} else if !access.allStores && !assigned(access.storeID, expectedStore) {
			return errWorkflowForbidden
		}
		result, err = transition(ctx, tx, order, access.userID, action, input)
		return err
	})
	return result, err
}

func transition(ctx context.Context, tx pgx.Tx, order Order, actorID, action string, input ActionInput) (Order, error) {
	next := order.Status
	var notifyStore, notifyUser *string
	switch action {
	case "review":
		if order.Status != "queued" && order.Status != "on_hold" {
			return Order{}, errWorkflowConflict
		}
		next = "reviewed"
	case "check-stock":
		// Hotspot orders are reviewed automatically on queueing; a held order is rechecked directly.
		if order.Status != "reviewed" && order.Status != "on_hold" &&
			(order.Status != "queued" || order.HotSpotID == nil) {
			return Order{}, errWorkflowConflict
		}
		reserved, err := reserve(ctx, tx, order)
		if err != nil {
			return Order{}, err
		}
		next = "on_hold"
		if reserved {
			next = "confirmed"
			if order.HotSpotID != nil {
				notifyUser = &order.OrderedByID
			}
		}
	case "request-replenishment":
		if order.Status != "on_hold" || order.HotSpotID == nil {
			return Order{}, errWorkflowConflict
		}
		return requestReplenishment(ctx, tx, order, actorID, *input.WarehouseID)
	case "dispatch":
		if order.Status != "confirmed" {
			return Order{}, errWorkflowConflict
		}
		if order.HotSpotID != nil {
			if input.RiderID == nil {
				return Order{}, errWorkflowInput
			}
			var eligible bool
			err := tx.QueryRow(ctx, `SELECT EXISTS (
				SELECT FROM users u JOIN role_user ru ON ru.user_id = u.id
				JOIN role_permission rp ON rp.role_id = ru.role_id
				JOIN permissions p ON p.id = rp.permission_id
				WHERE u.id = $1 AND u.status = 'active' AND u.store_id = $2
					AND p.name = 'orders:deliver')`, input.RiderID, order.OrderedFromStoreID).Scan(&eligible)
			if err != nil {
				return Order{}, err
			}
			if !eligible {
				return Order{}, errWorkflowInput
			}
			order.RiderID = input.RiderID
			notifyUser = order.RiderID
		} else {
			if input.RiderID != nil {
				return Order{}, errWorkflowInput
			}
			notifyStore = &order.OrderedForStoreID
		}
		// A partial dispatch issues less than requested and releases the rest of the reservation.
		quantity := order.QuantityNeeded
		if input.QuantityIssued != nil {
			if *input.QuantityIssued > order.QuantityNeeded {
				return Order{}, errWorkflowInput
			}
			quantity = *input.QuantityIssued
		}
		var onHand int64
		err := tx.QueryRow(ctx, `UPDATE order_store_stock
			SET on_hand = on_hand - $5, reserved = reserved - $4, updated_at = CURRENT_TIMESTAMP
			WHERE store_id = $1 AND condom_id = $2 AND unit_of_measure_id = $3 AND reserved >= $4
			RETURNING on_hand`,
			order.OrderedFromStoreID, order.CondomID, order.UnitOfMeasureID, order.QuantityNeeded, quantity).Scan(&onHand)
		if errors.Is(err, pgx.ErrNoRows) {
			return Order{}, errWorkflowConflict
		}
		if err != nil {
			return Order{}, err
		}
		if err = recordMovement(ctx, tx, order, order.OrderedFromStoreID, "dispatch", -int64(quantity), onHand, actorID); err != nil {
			return Order{}, err
		}
		order.QuantityIssued = &quantity
		order.HandledByID = &actorID
		next = "dispatched"
	case "receive":
		if order.Status != "dispatched" || order.ParentOrderID == nil {
			return Order{}, errWorkflowConflict
		}
		if *input.QuantityReceived != *order.QuantityIssued && input.DiscrepancyNote == nil {
			return Order{}, errWorkflowInput
		}
		var onHand int64
		err := tx.QueryRow(ctx, `INSERT INTO order_store_stock (store_id, condom_id, unit_of_measure_id, on_hand)
			VALUES ($1, $2, $3, $4)
			ON CONFLICT (store_id, condom_id, unit_of_measure_id)
			DO UPDATE SET on_hand = order_store_stock.on_hand + EXCLUDED.on_hand, updated_at = CURRENT_TIMESTAMP
			RETURNING on_hand`,
			order.OrderedForStoreID, order.CondomID, order.UnitOfMeasureID, *input.QuantityReceived).Scan(&onHand)
		if err != nil {
			return Order{}, err
		}
		if *input.QuantityReceived > 0 {
			if err = recordMovement(ctx, tx, order, order.OrderedForStoreID, "order_receipt",
				int64(*input.QuantityReceived), onHand, actorID); err != nil {
				return Order{}, err
			}
		}
		if err = confirmHeldOrder(ctx, tx, *order.ParentOrderID, actorID); err != nil {
			return Order{}, err
		}
		order.QuantityReceived = input.QuantityReceived
		order.DiscrepancyNote = input.DiscrepancyNote
		notifyStore = &order.OrderedForStoreID
		next = "received"
	case "deliver":
		if order.Status != "dispatched" || order.HotSpotID == nil {
			return Order{}, errWorkflowConflict
		}
		order.DeliveryNote = input.DeliveryNote
		notifyUser = &order.OrderedByID
		next = "delivered"
	}
	result, err := scanOrder(tx.QueryRow(ctx, `UPDATE orders SET order_status = $2, quantity_issued = $3,
		handled_by_id = $4, rider_id = $5, quantity_received = $6, discrepancy_note = $7, delivery_note = $8,
		updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING `+columns, order.ID, next, order.QuantityIssued,
		order.HandledByID, order.RiderID, order.QuantityReceived, order.DiscrepancyNote, order.DeliveryNote))
	if err != nil {
		return Order{}, err
	}
	return result, addEvent(ctx, tx, result, actorID, action, notifyStore, notifyUser)
}

// recordMovement adds an order's stock change at a store to the inventory ledger.
func recordMovement(ctx context.Context, tx pgx.Tx, order Order, storeID, reason string, quantity, onHandAfter int64, actorID string) error {
	_, err := tx.Exec(ctx, `INSERT INTO inventory_movements
		(store_id, condom_id, unit_of_measure_id, reason, quantity, on_hand_after, order_id, actor_id)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
		storeID, order.CondomID, order.UnitOfMeasureID, reason, quantity, onHandAfter, order.ID, actorID)
	return err
}

// reserve holds the order's full quantity at the supplying store when enough unreserved stock is on hand.
func reserve(ctx context.Context, tx pgx.Tx, order Order) (bool, error) {
	tag, err := tx.Exec(ctx, `UPDATE order_store_stock
		SET reserved = reserved + $4, updated_at = CURRENT_TIMESTAMP
		WHERE store_id = $1 AND condom_id = $2 AND unit_of_measure_id = $3
			AND on_hand - reserved >= $4`, order.OrderedFromStoreID, order.CondomID,
		order.UnitOfMeasureID, order.QuantityNeeded)
	return tag.RowsAffected() == 1, err
}

// confirmHeldOrder reserves just-received stock for the hotspot order that requested it, before any
// other order can take it, and sends the hotspot manager the order confirmation. The caller holds the lock.
func confirmHeldOrder(ctx context.Context, tx pgx.Tx, id, actorID string) error {
	held, err := scanOrder(tx.QueryRow(ctx, `SELECT `+columns+` FROM orders WHERE id = $1`, id))
	if err != nil {
		return err
	}
	if held.Status != "queued" && held.Status != "reviewed" && held.Status != "on_hold" {
		return nil
	}
	reserved, err := reserve(ctx, tx, held)
	if err != nil || !reserved {
		return err
	}
	confirmed, err := scanOrder(tx.QueryRow(ctx, `UPDATE orders SET order_status = 'confirmed',
		updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING `+columns, id))
	if err != nil {
		return err
	}
	return addEvent(ctx, tx, confirmed, actorID, "check-stock", nil, &confirmed.OrderedByID)
}

func requestReplenishment(ctx context.Context, tx pgx.Tx, order Order, actorID, warehouseID string) (Order, error) {
	child, err := scanOrder(tx.QueryRow(ctx, `INSERT INTO orders
		(parent_order_id, condom_id, unit_of_measure_id, quantity_needed, ordered_by_id,
			ordered_for_store_id, ordered_from_store_id, order_status)
		SELECT $1, $2, $3, $4, $5, $6, id, 'queued' FROM stores WHERE id = $7 AND store_type = 'national'
		ON CONFLICT (parent_order_id) WHERE parent_order_id IS NOT NULL AND order_status <> 'received' DO NOTHING
		RETURNING `+columns, order.ID, order.CondomID, order.UnitOfMeasureID,
		order.QuantityNeeded, actorID, order.OrderedFromStoreID, warehouseID))
	if errors.Is(err, pgx.ErrNoRows) {
		return Order{}, errWorkflowConflict
	}
	if err != nil {
		return Order{}, err
	}
	if err = addEvent(ctx, tx, order, actorID, "request-replenishment", nil, nil); err != nil {
		return Order{}, err
	}
	return child, addEvent(ctx, tx, child, actorID, "replenishment_requested", &warehouseID, nil)
}

type Event struct {
	ID        string    `json:"id"`
	OrderID   string    `json:"order_id"`
	ActorID   string    `json:"actor_id"`
	Action    string    `json:"action"`
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"created_at"`
}

func addEvent(ctx context.Context, tx pgx.Tx, order Order, actorID, action string, storeID, userID *string) error {
	_, err := tx.Exec(ctx, `INSERT INTO order_events (order_id, actor_id, action, status, notify_store_id, notify_user_id)
		VALUES ($1, $2, $3, $4, $5, $6)`, order.ID, actorID, action, order.Status, storeID, userID)
	return err
}

func (r *Repository) listEvents(ctx context.Context, access scope, id *string, offset int32) ([]Event, error) {
	if id != nil {
		if _, err := r.get(ctx, access, *id); err != nil {
			return nil, err
		}
	}
	rows, err := r.db.Query(ctx, `SELECT id, order_id, actor_id, action, status, created_at FROM order_events
		WHERE ($1::uuid IS NOT NULL AND order_id = $1) OR
			($1 IS NULL AND (notify_store_id = $2::uuid OR notify_user_id = $3::uuid
				OR ($4::boolean AND (notify_store_id IS NOT NULL OR notify_user_id IS NOT NULL))))
		ORDER BY created_at DESC, id DESC LIMIT 50 OFFSET $5`, id, access.storeID,
		access.userID, access.allStores, offset)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowToStructByPos[Event])
}
