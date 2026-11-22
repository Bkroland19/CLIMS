package orders

import (
	"context"
	"errors"
	"fmt"
	"time"

	"clims-backend/internal/features/stock"
	"clims-backend/internal/features/users"

	"github.com/jackc/pgx/v5"
)

var (
	errWorkflowConflict  = errors.New("action is unavailable in the current order state")
	errWorkflowForbidden = errors.New("this action is outside your assignment")
	errWorkflowInput     = errors.New("action requires valid shipment or receipt details")
	errHotSpotRoute      = errors.New("hotspot has no district with a store; set the hotspot's district")
	errNotDistrictStore  = errors.New("warehouse orders are placed for your assigned district store; assign your account one")
	errNotWarehouse      = errors.New("warehouse_store_id must name a national warehouse (NMS or JMS)")
	errUnknownProduct    = errors.New("condom_id does not name a product")
	errChooseProduct     = errors.New("choose the product to send: give condom_id at review")
	errWrongCategory     = errors.New("the product chosen is not of the condom category requested")
	errExpiredStock      = errors.New("not enough unexpired stock: expired batches cannot be issued")
	errRejectReason      = errors.New("say why the order is rejected")
)

// ActionInput carries the details a workflow step needs: an optional smaller quantity at dispatch,
// and the counted quantity (with a note when it differs) at receipt.
type ActionInput struct {
	// QuantityApproved lets the warehouse approve less than requested at review.
	QuantityApproved *int32 `json:"quantity_approved"`
	// CondomID is the product the warehouse sends, chosen at review from the category requested.
	CondomID *string `json:"condom_id"`
	// ExpiryExceptionReason documents dispatching a batch with under one month left.
	ExpiryExceptionReason *string `json:"expiry_exception_reason"`
	QuantityReceived      *int32  `json:"quantity_received"`
	QuantityIssued        *int32  `json:"quantity_issued"`
	DiscrepancyNote       *string `json:"discrepancy_note"`
	// Reason says why the warehouse rejects the order; the district's DCFPs read it.
	Reason *string `json:"reason"`
	// The transport recorded at dispatch, each optional.
	WaybillNumber       *string `json:"waybill_number"`
	VehicleRegistration *string `json:"vehicle_registration"`
	DriverName          *string `json:"driver_name"`
	DriverPhone         *string `json:"driver_phone"`
}

// WarehouseRequestInput is a DCFP's order to a national warehouse: which warehouse, which condom
// category (male or female), and how much in which unit. The warehouse chooses the product.
type WarehouseRequestInput struct {
	WarehouseID     string  `json:"warehouse_store_id"`
	CondomCategory  string  `json:"condom_category"`
	Quantity        int32   `json:"quantity"`
	UnitOfMeasureID string  `json:"unit_of_measure_id"`
	Comment         *string `json:"comment"`
}

// createWarehouseRequest places a DCFP's order with NMS or JMS for their district store. The order
// is queued for the warehouse, whose staff are notified.
func (r *Repository) createWarehouseRequest(ctx context.Context, access scope, input WarehouseRequestInput) (Order, error) {
	var order Order
	err := pgx.BeginFunc(ctx, r.db, func(tx pgx.Tx) error {
		storeType := func(id string) (string, error) {
			var kind string
			err := tx.QueryRow(ctx, `SELECT store_type FROM stores WHERE id = $1`, id).Scan(&kind)
			if errors.Is(err, pgx.ErrNoRows) {
				return "", nil
			}
			return kind, err
		}
		if access.storeID == nil {
			return errNotDistrictStore
		}
		if kind, err := storeType(*access.storeID); err != nil {
			return err
		} else if kind != "district" {
			return errNotDistrictStore
		}
		if kind, err := storeType(input.WarehouseID); err != nil {
			return err
		} else if kind != "national" {
			return errNotWarehouse
		}
		var err error
		order, err = scanOrder(tx.QueryRow(ctx, `INSERT INTO orders (condom_category, unit_of_measure_id, quantity_needed,
				ordered_by_id, ordered_for_store_id, ordered_from_store_id, order_status, comment)
			VALUES ($1, $2, $3, $4, $5, $6, 'queued', $7)
			RETURNING `+columns, input.CondomCategory, input.UnitOfMeasureID, input.Quantity, access.userID, *access.storeID,
			input.WarehouseID, input.Comment))
		if err != nil {
			return err
		}
		return r.record(ctx, tx, nil, order, access.userID, "replenishment_requested")
	})
	return order, err
}

// activeInDistrictOf reports whether a hotspot is active and in the district the user works in
// (their store's district, else their subcounty's). Inactive hotspots get no stock, so alerts for
// them are refused (9).
func (r *Repository) activeInDistrictOf(ctx context.Context, userID, hotSpotID string) (bool, error) {
	var ok bool
	err := r.db.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM hot_spots h WHERE h.id = $2::uuid
		AND h.status = 'active' AND h.district_id = `+users.DistrictOfUser+`)`, userID, hotSpotID).Scan(&ok)
	if err != nil {
		return false, fmt.Errorf("check hotspot district: %w", err)
	}
	return ok, nil
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
		// Generic orders use fulfill, and alert orders raised before stockouts became reports are history.
		if order.HotSpotID != nil || order.Status == "pending" || order.Status == "fulfilled" {
			return errWorkflowConflict
		}
		expectedStore := order.OrderedFromStoreID
		if action == "receive" {
			expectedStore = order.OrderedForStoreID
		}
		if !access.allStores && !assigned(access.storeID, expectedStore) {
			return errWorkflowForbidden
		}
		result, err = r.transition(ctx, tx, order, access.userID, action, input)
		return err
	})
	return result, err
}

// transition moves a warehouse request one step: the warehouse reviews, checks stock (reserving it,
// or holding the request until stock arrives) and dispatches; the district receives. Before dispatch
// the warehouse may reject the order with a reason instead, releasing anything reserved.
func (r *Repository) transition(ctx context.Context, tx pgx.Tx, order Order, actorID, action string, input ActionInput) (Order, error) {
	before := order
	next := order.Status
	switch action {
	case "review":
		if order.Status != "queued" && order.Status != "on_hold" {
			return Order{}, errWorkflowConflict
		}
		// The warehouse approves the request as made or a smaller quantity; the request is kept.
		approved := *order.QuantityNeeded
		if input.QuantityApproved != nil {
			if *input.QuantityApproved > approved {
				return Order{}, errWorkflowInput
			}
			approved = *input.QuantityApproved
		}
		order.QuantityApproved = &approved
		// The warehouse chooses the product to send from the category requested. Nothing is reserved
		// before check-stock, so a held request may switch to another product at a new review.
		if input.CondomID != nil {
			if err := chooseProduct(ctx, tx, &order, *input.CondomID); err != nil {
				return Order{}, err
			}
		}
		if order.CondomID == nil {
			return Order{}, errChooseProduct
		}
		next = "reviewed"
	case "check-stock":
		// A held request is rechecked directly once stock arrives.
		if order.Status != "reviewed" && order.Status != "on_hold" {
			return Order{}, errWorkflowConflict
		}
		reserved, err := reserve(ctx, tx, order, stock.Today(time.Now()))
		if err != nil {
			return Order{}, err
		}
		next = "on_hold"
		if reserved {
			next = "confirmed"
		}
	case "reject":
		// A rejection closes the order at any step before dispatch; the DCFP orders again if needed.
		switch order.Status {
		case "queued", "reviewed", "on_hold", "confirmed":
		default:
			return Order{}, errWorkflowConflict
		}
		if order.Status == "confirmed" {
			// check-stock reserved the approved quantity; give it back.
			tag, err := tx.Exec(ctx, `UPDATE order_store_stock SET reserved = reserved - $4, updated_at = CURRENT_TIMESTAMP
				WHERE store_id = $1 AND condom_id = $2 AND unit_of_measure_id = $3 AND reserved >= $4`,
				order.OrderedFromStoreID, *order.CondomID, order.UnitOfMeasureID, approvedQuantity(order))
			if err != nil {
				return Order{}, err
			}
			if tag.RowsAffected() != 1 {
				return Order{}, fmt.Errorf("reject order %s: its reservation is missing", order.ID)
			}
		}
		order.RejectionReason = input.Reason
		next = "rejected"
	case "dispatch":
		// The warehouse ships what check-stock reserved, or less, releasing the rest.
		if order.Status != "confirmed" {
			return Order{}, errWorkflowConflict
		}
		quantity := approvedQuantity(order)
		if input.QuantityIssued != nil {
			if *input.QuantityIssued > quantity {
				return Order{}, errWorkflowInput
			}
			quantity = *input.QuantityIssued
		}
		var onHand int64
		err := tx.QueryRow(ctx, `UPDATE order_store_stock
			SET on_hand = on_hand - $5, reserved = reserved - $4, updated_at = CURRENT_TIMESTAMP
			WHERE store_id = $1 AND condom_id = $2 AND unit_of_measure_id = $3 AND reserved >= $4
			RETURNING on_hand`,
			order.OrderedFromStoreID, *order.CondomID, order.UnitOfMeasureID, approvedQuantity(order), quantity).Scan(&onHand)
		if errors.Is(err, pgx.ErrNoRows) {
			return Order{}, errWorkflowConflict
		}
		if err != nil {
			return Order{}, err
		}
		// Stock leaves first-expiry-first-out; expired batches stay behind.
		taken, err := stock.Take(ctx, tx, order.OrderedFromStoreID, *order.CondomID, *order.UnitOfMeasureID, int64(quantity),
			stock.Today(time.Now()), input.ExpiryExceptionReason)
		if errors.Is(err, stock.ErrShort) {
			return Order{}, errExpiredStock
		}
		if err != nil {
			return Order{}, err
		}
		if err = stock.Ship(ctx, tx, taken, &order.ID, nil, nil, actorID, input.ExpiryExceptionReason); err != nil {
			return Order{}, err
		}
		if err := recordMovement(ctx, tx, order, order.OrderedFromStoreID, "dispatch", -int64(quantity), onHand, actorID); err != nil {
			return Order{}, err
		}
		order.QuantityIssued = &quantity
		order.HandledByID = &actorID
		order.WaybillNumber, order.VehicleRegistration = input.WaybillNumber, input.VehicleRegistration
		order.DriverName, order.DriverPhone = input.DriverName, input.DriverPhone
		next = "dispatched"
	case "receive":
		if order.Status != "dispatched" {
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
			order.OrderedForStoreID, *order.CondomID, order.UnitOfMeasureID, *input.QuantityReceived).Scan(&onHand)
		if err != nil {
			return Order{}, err
		}
		if *input.QuantityReceived > 0 {
			// The district's batches are the ones the warehouse shipped.
			if err = stock.Receive(ctx, tx, order.OrderedForStoreID, *order.CondomID, *order.UnitOfMeasureID, order.ID,
				int64(*input.QuantityReceived)); err != nil {
				return Order{}, err
			}
			if err = recordMovement(ctx, tx, order, order.OrderedForStoreID, "order_receipt",
				int64(*input.QuantityReceived), onHand, actorID); err != nil {
				return Order{}, err
			}
		}
		order.QuantityReceived = input.QuantityReceived
		order.DiscrepancyNote = input.DiscrepancyNote
		next = "received"
	}
	result, err := scanOrder(tx.QueryRow(ctx, `UPDATE orders SET order_status = $2, quantity_issued = $3,
		handled_by_id = $4, quantity_received = $5, discrepancy_note = $6, quantity_approved = $7, condom_id = $8,
		rejection_reason = $9, waybill_number = $10, vehicle_registration = $11, driver_name = $12,
		driver_phone = $13, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING `+columns, order.ID, next,
		order.QuantityIssued, order.HandledByID, order.QuantityReceived, order.DiscrepancyNote, order.QuantityApproved,
		order.CondomID, order.RejectionReason, order.WaybillNumber, order.VehicleRegistration, order.DriverName,
		order.DriverPhone))
	if err != nil {
		return Order{}, err
	}
	return result, r.record(ctx, tx, &before, result, actorID, action)
}

// chooseProduct sets the product the warehouse sends: an active product of the category requested.
func chooseProduct(ctx context.Context, tx pgx.Tx, order *Order, condomID string) error {
	if err := checkOrderable(ctx, tx, condomID); err != nil {
		return err
	}
	var category *string
	err := tx.QueryRow(ctx, `SELECT category FROM condoms WHERE id = $1`, condomID).Scan(&category)
	if errors.Is(err, pgx.ErrNoRows) {
		return errUnknownProduct
	}
	if err != nil {
		return err
	}
	if order.CondomCategory != nil && (category == nil || *category != *order.CondomCategory) {
		return errWrongCategory
	}
	order.CondomID = &condomID
	return nil
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
func reserve(ctx context.Context, tx pgx.Tx, order Order, today time.Time) (bool, error) {
	// Expired stock cannot be issued, so it cannot be reserved either.
	tag, err := tx.Exec(ctx, `UPDATE order_store_stock b
		SET reserved = reserved + $4, updated_at = CURRENT_TIMESTAMP
		WHERE store_id = $1 AND condom_id = $2 AND unit_of_measure_id = $3
			AND on_hand - reserved - `+stock.ExpiredQuantity("$5::date")+` >= $4`, order.OrderedFromStoreID, order.CondomID,
		order.UnitOfMeasureID, approvedQuantity(order), today)
	return tag.RowsAffected() == 1, err
}

// approvedQuantity is the quantity the warehouse approved, or the request for orders reviewed
// before approval was recorded.
func approvedQuantity(order Order) int32 {
	if order.QuantityApproved != nil {
		return *order.QuantityApproved
	}
	return *order.QuantityNeeded
}

type Event struct {
	ID        string    `json:"id"`
	OrderID   string    `json:"order_id"`
	ActorID   string    `json:"actor_id"`
	Action    string    `json:"action"`
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"created_at"`
}

// listEvents is an order's history, newest first, for a user who may see the order.
func (r *Repository) listEvents(ctx context.Context, access scope, id string, offset int32) ([]Event, error) {
	if _, err := r.get(ctx, access, id); err != nil {
		return nil, err
	}
	rows, err := r.db.Query(ctx, `SELECT id, order_id, actor_id, action, status, created_at FROM order_events
		WHERE order_id = $1 ORDER BY created_at DESC, id DESC LIMIT 50 OFFSET $2`, id, offset)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowToStructByPos[Event])
}
