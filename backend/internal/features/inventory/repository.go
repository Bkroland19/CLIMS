package inventory

import (
	"context"

	"clims-backend/internal/features/stock"
	"errors"
	"time"

	"clims-backend/internal/features/audit"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// errBelowReserved stops an adjustment from leaving less stock than open orders have reserved.
var errBelowReserved = errors.New("adjustment would leave less stock on hand than is reserved for open orders")

type scope struct {
	storeID   *string
	hotSpotID *string
	allStores bool
}

// period bounds reports by time; nil ends are open.
type period struct {
	from, to *time.Time
}

type Repository struct {
	db    *pgxpool.Pool
	audit audit.Auditor
}

func NewRepository(db *pgxpool.Pool, auditor audit.Auditor) *Repository {
	return &Repository{db: db, audit: auditor}
}

// productName labels a condom product as brand, type and category,
// e.g. "Engabu Free Male". Parts a legacy product lacks are left out.
const productName = `concat_ws(' ', (SELECT pb.name FROM brands pb WHERE pb.id = c.brand_id),
	(SELECT pt.name FROM product_types pt WHERE pt.id = c.type_id),
	CASE c.category WHEN 'male' THEN 'Male' WHEN 'female' THEN 'Female' END)`

type StockBalance struct {
	StoreID         string    `json:"store_id"`
	StoreName       string    `json:"store_name"`
	StoreType       string    `json:"store_type"`
	DistrictID      *string   `json:"district_id"`
	DistrictName    *string   `json:"district_name"`
	CondomID        string    `json:"condom_id"`
	Product         string    `json:"product"`
	UnitOfMeasureID string    `json:"unit_of_measure_id"`
	Unit            string    `json:"unit"`
	OnHand          int64     `json:"on_hand"`
	Reserved        int64     `json:"reserved"`
	Available       int64     `json:"available"`
	Incoming        int64     `json:"incoming"`
	UpdatedAt       time.Time `json:"updated_at"`
}

type StockFilter struct {
	StoreID   *string
	StoreType string
	CondomID  *string
}

// stock lists store balances: on hand, reserved for confirmed orders, available, and incoming from
// dispatched replenishments.
// shortcut: a store with stock in transit but no balance row yet shows no incoming line; the summary
// counts it under in_transit. Upgrade by listing transit-only rows if districts report missing stock.
func (r *Repository) stock(ctx context.Context, access scope, f StockFilter) ([]StockBalance, error) {
	rows, err := r.db.Query(ctx, `SELECT s.id, s.name, s.store_type, d.id, d.name, b.condom_id, `+productName+`,
			b.unit_of_measure_id, um.name, b.on_hand, b.reserved, b.on_hand - b.reserved,
			COALESCE((SELECT sum(o.quantity_issued) FROM orders o
				WHERE o.ordered_for_store_id = b.store_id AND o.condom_id = b.condom_id
					AND o.unit_of_measure_id = b.unit_of_measure_id AND o.order_status = 'dispatched'
					AND o.parent_order_id IS NOT NULL), 0),
			b.updated_at
		FROM order_store_stock b
		JOIN stores s ON s.id = b.store_id
		LEFT JOIN districts d ON d.id = s.district_id
		JOIN condoms c ON c.id = b.condom_id
		JOIN unit_of_measures um ON um.id = b.unit_of_measure_id
		WHERE ($1::boolean OR b.store_id = $2::uuid)
			AND ($3::uuid IS NULL OR b.store_id = $3) AND ($4 = '' OR s.store_type = $4)
			AND ($5::uuid IS NULL OR b.condom_id = $5)
		ORDER BY s.store_type = 'district', s.name, 7, um.name`,
		access.allStores, access.storeID, f.StoreID, f.StoreType, f.CondomID)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowToStructByPos[StockBalance])
}

type HotspotStock struct {
	HotSpotID       string     `json:"hot_spot_id"`
	HotSpotName     *string    `json:"hot_spot_name"`
	DistrictID      *string    `json:"district_id"`
	CondomID        string     `json:"condom_id"`
	Product         string     `json:"product"`
	UnitOfMeasureID *string    `json:"unit_of_measure_id"`
	Unit            *string    `json:"unit"`
	Delivered       int64      `json:"delivered"`
	Deliveries      int64      `json:"deliveries"`
	LastDeliveredAt *time.Time `json:"last_delivered_at"`
	InTransit       int64      `json:"in_transit"`
	OpenAlerts      int64      `json:"open_alerts"`
	OnHoldRequests  int64      `json:"on_hold_requests"`
	LastStockoutAt  time.Time  `json:"last_stockout_at"`
}

type HotspotFilter struct {
	HotSpotID *string
	CondomID  *string
	Period    period
}

// hotspots reports stock sent to each hotspot through stockout alerts: delivered in the period, on the
// way, and alerts still open. An open alert has no unit until the DCFP acts, so it is reported on a row
// without one. Hotspot consumption is not recorded, so this is supply, not a count.
func (r *Repository) hotspots(ctx context.Context, access scope, f HotspotFilter) ([]HotspotStock, error) {
	rows, err := r.db.Query(ctx, `SELECT h.id, h.name, h.district_id, o.condom_id, `+productName+`,
			o.unit_of_measure_id, um.name,
			COALESCE(sum(o.quantity_issued) FILTER (WHERE o.order_status = 'delivered' AND `+inPeriod+`), 0),
			count(*) FILTER (WHERE o.order_status = 'delivered' AND `+inPeriod+`),
			max(o.updated_at) FILTER (WHERE o.order_status = 'delivered'),
			COALESCE(sum(o.quantity_issued) FILTER (WHERE o.order_status = 'dispatched'), 0),
			count(*) FILTER (WHERE o.order_status IN ('queued', 'on_hold')),
			count(*) FILTER (WHERE o.order_status = 'on_hold'),
			max(o.created_at)
		FROM orders o
		JOIN hot_spots h ON h.id = o.hot_spot_id
		JOIN condoms c ON c.id = o.condom_id
		LEFT JOIN unit_of_measures um ON um.id = o.unit_of_measure_id
		WHERE ($1::boolean OR o.hot_spot_id = $2::uuid OR o.ordered_from_store_id = $3::uuid)
			AND ($4::uuid IS NULL OR o.hot_spot_id = $4) AND ($5::uuid IS NULL OR o.condom_id = $5)
		GROUP BY h.id, h.name, h.district_id, o.condom_id, c.brand_id, c.type_id, c.category, o.unit_of_measure_id, um.name
		ORDER BY h.name, 5, um.name NULLS FIRST`,
		access.allStores, access.hotSpotID, access.storeID, f.HotSpotID, f.CondomID, f.Period.from, f.Period.to)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowToStructByPos[HotspotStock])
}

// inPeriod filters an order's last change by the report period ($6 from, $7 to).
const inPeriod = `($6::timestamptz IS NULL OR o.updated_at >= $6) AND ($7::timestamptz IS NULL OR o.updated_at < $7)`

type Movement struct {
	ID              string    `json:"id"`
	StoreID         string    `json:"store_id"`
	StoreName       string    `json:"store_name"`
	CondomID        string    `json:"condom_id"`
	Product         string    `json:"product"`
	UnitOfMeasureID string    `json:"unit_of_measure_id"`
	Unit            string    `json:"unit"`
	Reason          string    `json:"reason"`
	Quantity        int64     `json:"quantity"`
	OnHandAfter     int64     `json:"on_hand_after"`
	OrderID         *string   `json:"order_id"`
	ActorID         *string   `json:"actor_id"`
	Note            *string   `json:"note"`
	CreatedAt       time.Time `json:"created_at"`
}

type MovementFilter struct {
	StoreID  *string
	CondomID *string
	Reason   string
	Period   period
	Limit    int32
	Offset   int32
}

const movementColumns = `m.id, m.store_id, s.name, m.condom_id, ` + productName + `, m.unit_of_measure_id, um.name,
	m.reason, m.quantity, m.on_hand_after, m.order_id, m.actor_id, m.note, m.created_at`

const movementJoins = ` FROM inventory_movements m
	JOIN stores s ON s.id = m.store_id
	JOIN condoms c ON c.id = m.condom_id
	JOIN unit_of_measures um ON um.id = m.unit_of_measure_id`

func (r *Repository) movements(ctx context.Context, access scope, f MovementFilter) ([]Movement, error) {
	rows, err := r.db.Query(ctx, `SELECT `+movementColumns+movementJoins+`
		WHERE ($1::boolean OR m.store_id = $2::uuid)
			AND ($3::uuid IS NULL OR m.store_id = $3) AND ($4::uuid IS NULL OR m.condom_id = $4)
			AND ($5 = '' OR m.reason = $5)
			AND ($6::timestamptz IS NULL OR m.created_at >= $6) AND ($7::timestamptz IS NULL OR m.created_at < $7)
		ORDER BY m.created_at DESC, m.id DESC LIMIT $8 OFFSET $9`,
		access.allStores, access.storeID, f.StoreID, f.CondomID, f.Reason, f.Period.from, f.Period.to, f.Limit, f.Offset)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowToStructByPos[Movement])
}

// MovementInput records stock received at a store or a correction after a count.
type MovementInput struct {
	StoreID         string  `json:"store_id"`
	CondomID        string  `json:"condom_id"`
	UnitOfMeasureID string  `json:"unit_of_measure_id"`
	Reason          string  `json:"reason"`
	Quantity        int64   `json:"quantity"`
	Note            *string `json:"note"`
	// BatchNumber and ExpiryDate name the batch the stock is in; omitted, it is the unknown-expiry batch.
	BatchNumber *string `json:"batch_number"`
	ExpiryDate  *string `json:"expiry_date"`
	expiry      *time.Time
}

func (r *Repository) record(ctx context.Context, actorID string, in MovementInput) (Movement, error) {
	var result Movement
	err := pgx.BeginFunc(ctx, r.db, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `INSERT INTO order_store_stock (store_id, condom_id, unit_of_measure_id, on_hand)
			VALUES ($1, $2, $3, 0) ON CONFLICT (store_id, condom_id, unit_of_measure_id) DO NOTHING`,
			in.StoreID, in.CondomID, in.UnitOfMeasureID); err != nil {
			return err
		}
		var onHand int64
		err := tx.QueryRow(ctx, `UPDATE order_store_stock SET on_hand = on_hand + $4, updated_at = CURRENT_TIMESTAMP
			WHERE store_id = $1 AND condom_id = $2 AND unit_of_measure_id = $3 AND on_hand + $4 >= reserved
			RETURNING on_hand`, in.StoreID, in.CondomID, in.UnitOfMeasureID, in.Quantity).Scan(&onHand)
		if errors.Is(err, pgx.ErrNoRows) {
			return errBelowReserved
		}
		if err != nil {
			return err
		}
		// The batches add up to the store total: a receipt or a positive count fills the named batch, and
		// a negative count must come out of it.
		var batchID string
		if in.Quantity > 0 {
			batchID, err = stock.Add(ctx, tx, in.StoreID, in.CondomID, in.UnitOfMeasureID, in.BatchNumber, in.expiry, in.Quantity)
		} else {
			batchID, err = stock.Remove(ctx, tx, in.StoreID, in.CondomID, in.UnitOfMeasureID, in.BatchNumber, in.expiry, -in.Quantity)
		}
		if err != nil {
			return err
		}
		var id string
		if err = tx.QueryRow(ctx, `INSERT INTO inventory_movements
				(store_id, condom_id, unit_of_measure_id, reason, quantity, on_hand_after, actor_id, note, stock_batch_id)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
			in.StoreID, in.CondomID, in.UnitOfMeasureID, in.Reason, in.Quantity, onHand, actorID, in.Note, batchID).Scan(&id); err != nil {
			return err
		}
		rows, err := tx.Query(ctx, `SELECT `+movementColumns+movementJoins+` WHERE m.id = $1`, id)
		if err != nil {
			return err
		}
		if result, err = pgx.CollectExactlyOneRow(rows, pgx.RowToStructByPos[Movement]); err != nil {
			return err
		}
		return r.audit.Record(ctx, tx, audit.Entry{Action: "inventory.movement_recorded",
			Target:  &audit.Subject{Type: "inventory_movement", ID: result.ID},
			Related: []audit.Subject{{Type: "store", ID: result.StoreID}, {Type: "product", ID: result.CondomID}},
			Details: map[string]any{"reason": result.Reason, "quantity": result.Quantity,
				"on_hand_after": result.OnHandAfter, "unit_of_measure_id": result.UnitOfMeasureID, "note": result.Note}})
	})
	return result, err
}

type ProductSummary struct {
	CondomID            string  `json:"condom_id"`
	Product             string  `json:"product"`
	UnitOfMeasureID     *string `json:"unit_of_measure_id"`
	Unit                *string `json:"unit"`
	WarehouseOnHand     int64   `json:"warehouse_on_hand"`
	WarehouseAvailable  int64   `json:"warehouse_available"`
	DistrictOnHand      int64   `json:"district_on_hand"`
	DistrictAvailable   int64   `json:"district_available"`
	InTransit           int64   `json:"in_transit"`
	DeliveredToHotspots int64   `json:"delivered_to_hotspots"`
	OpenHotspotRequests int64   `json:"open_hotspot_requests"`
	OnHoldRequests      int64   `json:"on_hold_requests"`
}

// summary totals each product across the supply chain: warehouse and district stock, stock on the
// way (warehouse to district or district to hotspot), and hotspot deliveries in the period. Open
// stockout alerts without a unit yet are counted on a row whose unit is null.
func (r *Repository) summary(ctx context.Context, condomID *string, p period) ([]ProductSummary, error) {
	balance := func(storeType, expression string) string {
		return `COALESCE((SELECT sum(` + expression + `) FROM order_store_stock b JOIN stores s ON s.id = b.store_id
			WHERE s.store_type = '` + storeType + `' AND b.condom_id = k.condom_id
				AND b.unit_of_measure_id = k.unit_of_measure_id), 0)`
	}
	orders := func(aggregate, condition string) string {
		return `COALESCE((SELECT ` + aggregate + ` FROM orders o WHERE o.condom_id = k.condom_id
			AND o.unit_of_measure_id IS NOT DISTINCT FROM k.unit_of_measure_id AND ` + condition + `), 0)`
	}
	rows, err := r.db.Query(ctx, `WITH keys AS (
			SELECT condom_id, unit_of_measure_id FROM order_store_stock
			UNION SELECT condom_id, unit_of_measure_id FROM orders)
		SELECT k.condom_id, `+productName+`, k.unit_of_measure_id, um.name,
			`+balance("national", "b.on_hand")+`, `+balance("national", "b.on_hand - b.reserved")+`,
			`+balance("district", "b.on_hand")+`, `+balance("district", "b.on_hand - b.reserved")+`,
			`+orders("sum(o.quantity_issued)", "o.order_status = 'dispatched'")+`,
			`+orders("sum(o.quantity_issued)", "o.hot_spot_id IS NOT NULL AND o.order_status = 'delivered' AND "+summaryPeriod)+`,
			`+orders("count(*)", "o.hot_spot_id IS NOT NULL AND o.order_status IN ('queued', 'on_hold')")+`,
			`+orders("count(*)", "o.order_status = 'on_hold'")+`
		FROM keys k
		JOIN condoms c ON c.id = k.condom_id
		LEFT JOIN unit_of_measures um ON um.id = k.unit_of_measure_id
		WHERE $1::uuid IS NULL OR k.condom_id = $1
		ORDER BY 2, 4 NULLS FIRST`, condomID, p.from, p.to)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowToStructByPos[ProductSummary])
}

const summaryPeriod = `($2::timestamptz IS NULL OR o.updated_at >= $2) AND ($3::timestamptz IS NULL OR o.updated_at < $3)`
