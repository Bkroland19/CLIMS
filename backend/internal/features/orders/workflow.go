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
	errHotSpotRoute      = errors.New("hotspot has no district with a store; set the hotspot's district")
	errNotEnoughStock    = errors.New("not enough available stock at the district store; request it from the warehouse")
)

type ActionInput struct {
	WarehouseID      *string `json:"warehouse_store_id"`
	RiderID          *string `json:"rider_id"`
	UnitOfMeasureID  *string `json:"unit_of_measure_id"`
	Quantity         *int32  `json:"quantity"`
	QuantityReceived *int32  `json:"quantity_received"`
	QuantityIssued   *int32  `json:"quantity_issued"`
	DiscrepancyNote  *string `json:"discrepancy_note"`
	DeliveryNote     *string `json:"delivery_note"`
}

// reportStockout raises a stockout alert for a hotspot. It names the product only: the DCFP decides the
// unit and quantity when sending stock or requesting it from the warehouse. The alert goes to the store
// of the hotspot's district, whose DCFPs are notified.
func (r *Repository) reportStockout(ctx context.Context, actorID, hotSpotID, condomID string, comment *string) (Order, error) {
	var order Order
	err := pgx.BeginFunc(ctx, r.db, func(tx pgx.Tx) error {
		if err := checkOrderable(ctx, tx, condomID); err != nil {
			return err
		}
		var err error
		order, err = scanOrder(tx.QueryRow(ctx, `
			INSERT INTO orders (hot_spot_id, condom_id, ordered_by_id, ordered_for_store_id, ordered_from_store_id,
				order_status, comment)
			SELECT h.id, $2, $3, s.id, s.id, 'queued', $4
			FROM hot_spots h JOIN stores s ON s.store_type = 'district' AND s.district_id = h.district_id
			WHERE h.id = $1
			RETURNING `+columns, hotSpotID, condomID, actorID, comment))
		if errors.Is(err, pgx.ErrNoRows) {
			return errHotSpotRoute
		}
		if err != nil {
			return err
		}
		return r.record(ctx, tx, order, actorID, "stockout_reported", &order.OrderedFromStoreID, nil)
	})
	return order, err
}

func assigned(id *string, expected string) bool {
	return id != nil && *id == expected
}

func (r *Repository) act(ctx context.Context, access scope, id, action string, input ActionInput) (Order, error) {
	var result Order
	err := pgx.BeginFunc(ctx, r.db, func(tx pgx.Tx) error {
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
		result, err = r.transition(ctx, tx, order, access.userID, action, input)
		return err
	})
	return result, err
}

func (r *Repository) transition(ctx context.Context, tx pgx.Tx, order Order, actorID, action string, input ActionInput) (Order, error) {
	next := order.Status
	var notifyStore, notifyUser *string
	alert := order.HotSpotID != nil
	// An open alert waits in the DCFP's queue, or on hold while the warehouse fills a request.
	openAlert := alert && (order.Status == "queued" || order.Status == "on_hold")
	switch action {
	case "review":
		// Only warehouse requests are reviewed; a stockout alert goes straight to the DCFP's decision.
		if alert || (order.Status != "queued" && order.Status != "on_hold") {
			return Order{}, errWorkflowConflict
		}
		next = "reviewed"
	case "check-stock":
		// A held warehouse request is rechecked directly once stock arrives.
		if alert || (order.Status != "reviewed" && order.Status != "on_hold") {
			return Order{}, errWorkflowConflict
		}
		reserved, err := reserve(ctx, tx, order)
		if err != nil {
			return Order{}, err
		}
		next = "on_hold"
		if reserved {
			next = "confirmed"
		}
	case "request-replenishment":
		if !openAlert {
			return Order{}, errWorkflowConflict
		}
		if input.UnitOfMeasureID == nil || input.Quantity == nil {
			return Order{}, errWorkflowInput
		}
		return r.requestReplenishment(ctx, tx, order, actorID, *input.WarehouseID, *input.UnitOfMeasureID, *input.Quantity)
	case "dispatch":
		var quantity int32
		var onHand int64
		if alert {
			// The DCFP sends stock from the district's available balance, choosing the unit and quantity.
			if !openAlert {
				return Order{}, errWorkflowConflict
			}
			if input.RiderID == nil || input.UnitOfMeasureID == nil || input.QuantityIssued == nil {
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
			quantity = *input.QuantityIssued
			err = tx.QueryRow(ctx, `UPDATE order_store_stock
				SET on_hand = on_hand - $4, updated_at = CURRENT_TIMESTAMP
				WHERE store_id = $1 AND condom_id = $2 AND unit_of_measure_id = $3 AND on_hand - reserved >= $4
				RETURNING on_hand`,
				order.OrderedFromStoreID, order.CondomID, input.UnitOfMeasureID, quantity).Scan(&onHand)
			if errors.Is(err, pgx.ErrNoRows) {
				return Order{}, errNotEnoughStock
			}
			if err != nil {
				return Order{}, err
			}
			order.UnitOfMeasureID = input.UnitOfMeasureID
			order.QuantityNeeded = &quantity
			order.RiderID = input.RiderID
			notifyUser = order.RiderID
		} else {
			// A warehouse request ships what check-stock reserved, or less, releasing the rest.
			if order.Status != "confirmed" {
				return Order{}, errWorkflowConflict
			}
			if input.RiderID != nil || input.UnitOfMeasureID != nil {
				return Order{}, errWorkflowInput
			}
			quantity = *order.QuantityNeeded
			if input.QuantityIssued != nil {
				if *input.QuantityIssued > quantity {
					return Order{}, errWorkflowInput
				}
				quantity = *input.QuantityIssued
			}
			err := tx.QueryRow(ctx, `UPDATE order_store_stock
				SET on_hand = on_hand - $5, reserved = reserved - $4, updated_at = CURRENT_TIMESTAMP
				WHERE store_id = $1 AND condom_id = $2 AND unit_of_measure_id = $3 AND reserved >= $4
				RETURNING on_hand`,
				order.OrderedFromStoreID, order.CondomID, order.UnitOfMeasureID, *order.QuantityNeeded, quantity).Scan(&onHand)
			if errors.Is(err, pgx.ErrNoRows) {
				return Order{}, errWorkflowConflict
			}
			if err != nil {
				return Order{}, err
			}
			notifyStore = &order.OrderedForStoreID
		}
		if err := recordMovement(ctx, tx, order, order.OrderedFromStoreID, "dispatch", -int64(quantity), onHand, actorID); err != nil {
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
		quantity_needed = $9, unit_of_measure_id = $10, updated_at = CURRENT_TIMESTAMP
		WHERE id = $1 RETURNING `+columns, order.ID, next, order.QuantityIssued, order.HandledByID, order.RiderID,
		order.QuantityReceived, order.DiscrepancyNote, order.DeliveryNote, order.QuantityNeeded, order.UnitOfMeasureID))
	if err != nil {
		return Order{}, err
	}
	return result, r.record(ctx, tx, result, actorID, action, notifyStore, notifyUser)
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

// requestReplenishment asks the warehouse for the unit and quantity the DCFP chose, linked to the alert,
// which then waits on hold. An alert has one open request at a time.
func (r *Repository) requestReplenishment(ctx context.Context, tx pgx.Tx, order Order, actorID, warehouseID, unitID string, quantity int32) (Order, error) {
	child, err := scanOrder(tx.QueryRow(ctx, `INSERT INTO orders
		(parent_order_id, condom_id, unit_of_measure_id, quantity_needed, ordered_by_id,
			ordered_for_store_id, ordered_from_store_id, order_status)
		SELECT $1, $2, $3, $4, $5, $6, id, 'queued' FROM stores WHERE id = $7 AND store_type = 'national'
		ON CONFLICT (parent_order_id) WHERE parent_order_id IS NOT NULL AND order_status <> 'received' DO NOTHING
		RETURNING `+columns, order.ID, order.CondomID, unitID, quantity, actorID, order.OrderedFromStoreID, warehouseID))
	if errors.Is(err, pgx.ErrNoRows) {
		return Order{}, errWorkflowConflict
	}
	if err != nil {
		return Order{}, err
	}
	held, err := scanOrder(tx.QueryRow(ctx, `UPDATE orders SET order_status = 'on_hold', updated_at = CURRENT_TIMESTAMP
		WHERE id = $1 RETURNING `+columns, order.ID))
	if err != nil {
		return Order{}, err
	}
	if err = r.record(ctx, tx, held, actorID, "request-replenishment", nil, nil); err != nil {
		return Order{}, err
	}
	return child, r.record(ctx, tx, child, actorID, "replenishment_requested", &warehouseID, nil)
}

type Event struct {
	ID        string    `json:"id"`
	OrderID   string    `json:"order_id"`
	ActorID   string    `json:"actor_id"`
	Action    string    `json:"action"`
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"created_at"`
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
