package orders

import (
	"context"
	"errors"
	"time"

	"clims-backend/internal/features/audit"
	"clims-backend/internal/features/notifications"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Order struct {
	HotSpotID        *string `json:"hot_spot_id"`
	ParentOrderID    *string `json:"parent_order_id"`
	RiderID          *string `json:"rider_id"`
	QuantityReceived *int32  `json:"quantity_received"`
	DiscrepancyNote  *string `json:"discrepancy_note"`
	DeliveryNote     *string `json:"delivery_note"`
	ID               string  `json:"id"`
	// CondomID is the product; a warehouse request has none until the warehouse chooses one at review.
	CondomID *string `json:"condom_id"`
	// CondomCategory is the type requested, male or female.
	CondomCategory *string `json:"condom_category"`
	QuantityNeeded *int32  `json:"quantity_needed"`
	// QuantityApproved is what the warehouse approved at review; the request keeps QuantityNeeded.
	QuantityApproved   *int32    `json:"quantity_approved"`
	QuantityIssued     *int32    `json:"quantity_issued"`
	Status             string    `json:"order_status"`
	Date               string    `json:"order_date"`
	OrderedByID        string    `json:"ordered_by_id"`
	HandledByID        *string   `json:"handled_by_id"`
	OrderedForStoreID  string    `json:"ordered_for_store_id"`
	OrderedFromStoreID string    `json:"ordered_from_store_id"`
	UnitOfMeasureID    *string   `json:"unit_of_measure_id"`
	Comment            *string   `json:"comment"`
	CreatedAt          time.Time `json:"created_at"`
	UpdatedAt          time.Time `json:"updated_at"`
	// RejectionReason says why the warehouse rejected the order; it is set only on rejected orders.
	RejectionReason *string `json:"rejection_reason"`
	// The transport the warehouse recorded at dispatch; each is optional.
	WaybillNumber       *string `json:"waybill_number"`
	VehicleRegistration *string `json:"vehicle_registration"`
	DriverName          *string `json:"driver_name"`
	DriverPhone         *string `json:"driver_phone"`
	// Unrequested marks stock the warehouse sent to the district without an order: it was created
	// dispatched, and the district receives it like any other shipment.
	Unrequested bool `json:"unrequested"`
}

type scope struct {
	storeID   *string
	hotSpotID *string
	userID    string
	allStores bool
	// stockoutDistrict lets the user raise alerts for active hotspots in the district they work in.
	stockoutDistrict bool
	// carrier lets a delivery agent (orders:deliver) acknowledge the deliveries named for them.
	carrier bool
}

type Repository struct {
	db       *pgxpool.Pool
	notifier notifications.Notifier
	audit    audit.Auditor
}

// NewRepository needs a notifier with NotificationTypes registered.
func NewRepository(db *pgxpool.Pool, notifier notifications.Notifier, auditor audit.Auditor) *Repository {
	return &Repository{db: db, notifier: notifier, audit: auditor}
}

const columns = `id, condom_id, quantity_needed, quantity_issued, order_status,
to_char(order_date, 'YYYY-MM-DD'), ordered_by_id, handled_by_id, ordered_for_store_id,
ordered_from_store_id, unit_of_measure_id, comment, created_at, updated_at,
hot_spot_id, parent_order_id, rider_id, quantity_received, discrepancy_note, delivery_note, quantity_approved,
condom_category, rejection_reason, waybill_number, vehicle_registration, driver_name, driver_phone, unrequested`

func scanOrder(row pgx.Row) (Order, error) {
	var order Order
	err := row.Scan(&order.ID, &order.CondomID, &order.QuantityNeeded, &order.QuantityIssued,
		&order.Status, &order.Date, &order.OrderedByID, &order.HandledByID,
		&order.OrderedForStoreID, &order.OrderedFromStoreID, &order.UnitOfMeasureID,
		&order.Comment, &order.CreatedAt, &order.UpdatedAt, &order.HotSpotID,
		&order.ParentOrderID, &order.RiderID, &order.QuantityReceived, &order.DiscrepancyNote, &order.DeliveryNote,
		&order.QuantityApproved, &order.CondomCategory, &order.RejectionReason, &order.WaybillNumber,
		&order.VehicleRegistration, &order.DriverName, &order.DriverPhone, &order.Unrequested)
	return order, err
}

const visibleOrders = `($1::boolean OR $2::uuid IN (ordered_for_store_id, ordered_from_store_id) OR hot_spot_id = $3::uuid OR rider_id = $4::uuid)`

func (r *Repository) list(ctx context.Context, access scope, limit, offset int32, status string) ([]Order, error) {
	rows, err := r.db.Query(ctx, `SELECT `+columns+` FROM orders WHERE `+visibleOrders+
		` AND ($7 = '' OR order_status = $7) ORDER BY created_at DESC, id DESC LIMIT $5 OFFSET $6`,
		access.allStores, access.storeID, access.hotSpotID, access.userID, limit, offset, status)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (Order, error) {
		return scanOrder(row)
	})
}

func (r *Repository) get(ctx context.Context, access scope, id string) (Order, error) {
	return scanOrder(r.db.QueryRow(ctx, `SELECT `+columns+` FROM orders WHERE `+visibleOrders+
		` AND id = $5`, access.allStores, access.storeID, access.hotSpotID, access.userID, id))
}

// errInactiveProduct stops new orders and stockout requests for a deactivated product.
// Orders already in progress, and their replenishments, carry on.
var errInactiveProduct = errors.New("product is inactive")

// checkOrderable rejects a deactivated product. A product that does not exist is left to the
// foreign key, which reports it.
func checkOrderable(ctx context.Context, q interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}, condomID string) error {
	var active bool
	err := q.QueryRow(ctx, `SELECT active FROM condoms WHERE id = $1`, condomID).Scan(&active)
	switch {
	case errors.Is(err, pgx.ErrNoRows):
		return nil
	case err != nil:
		return err
	case !active:
		return errInactiveProduct
	}
	return nil
}

// auditActions names each workflow step in the audit log.
var auditActions = map[string]string{
	"replenishment_requested": "order.requested",
	"review":                  "order.reviewed",
	"check-stock":             "order.stock_checked",
	"reject":                  "order.rejected",
	"dispatch":                "order.dispatched",
	"receive":                 "order.received",
}

// recordAudit writes an order change to the audit log, findable under the order, both
// stores, the product and any hotspot. A nil before is a new order.
func (r *Repository) recordAudit(ctx context.Context, tx pgx.Tx, action string, before *Order, after Order) error {
	var changes map[string]audit.Change
	if before == nil {
		changes = audit.Diff(nil, after)
	} else {
		changes = audit.Diff(*before, after)
	}
	related := []audit.Subject{{Type: "store", ID: after.OrderedFromStoreID}, {Type: "store", ID: after.OrderedForStoreID}}
	// A category request has no product until the warehouse chooses one at review.
	if after.CondomID != nil {
		related = append(related, audit.Subject{Type: "product", ID: *after.CondomID})
	}
	if after.HotSpotID != nil {
		related = append(related, audit.Subject{Type: "hotspot", ID: *after.HotSpotID})
	}
	return r.audit.Record(ctx, tx, audit.Entry{Action: action, Target: &audit.Subject{Type: "order", ID: after.ID},
		Related: related, Changes: changes})
}
