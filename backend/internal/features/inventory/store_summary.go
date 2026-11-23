package inventory

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

// errStoreNotFound answers a summary for a store that does not exist.
var errStoreNotFound = errors.New("store not found")

// StoreSummary is one store at a glance: its stock per product and unit, what moved in the period, and
// the orders district stores placed with it.
type StoreSummary struct {
	StoreID   string                `json:"store_id"`
	StoreName string                `json:"store_name"`
	StoreType string                `json:"store_type"`
	Products  []StoreProductSummary `json:"products"`
	Orders    StoreOrderSummary     `json:"orders"`
}

// StoreProductSummary is a store's stock of one product in one unit. Stock levels are as of now; received,
// dispatched and written off cover the period.
type StoreProductSummary struct {
	CondomID        string `json:"condom_id"`
	Product         string `json:"product"`
	UnitOfMeasureID string `json:"unit_of_measure_id"`
	Unit            string `json:"unit"`
	OnHand          int64  `json:"on_hand"`
	Reserved        int64  `json:"reserved"`
	// Expired is held in batches past their expiry date; it cannot be reserved or dispatched.
	Expired int64 `json:"expired"`
	// Expiring is held in batches with under three months left, not yet expired.
	Expiring int64 `json:"expiring"`
	// NoExpiry is held without an expiry date recorded.
	NoExpiry int64 `json:"no_expiry"`
	// Usable is on hand less reserved and less expired: what check-stock can still reserve.
	Usable int64 `json:"usable"`
	// NextExpiry is the earliest expiry date of an unexpired batch, YYYY-MM-DD.
	NextExpiry *string `json:"next_expiry"`
	Received   int64   `json:"received"`
	Dispatched int64   `json:"dispatched"`
	// WrittenOff is what adjustments took away: counted short, damaged, expired or lost.
	WrittenOff int64 `json:"written_off"`
	// Dispatched90Days is dispatched in the 90 days to now, whatever the period, for stock cover.
	Dispatched90Days int64 `json:"dispatched_90_days"`
}

// StoreOrderSummary counts the orders district stores placed with the store. The open counts are as of now;
// the rest count workflow steps taken in the period.
type StoreOrderSummary struct {
	// ToDecide are new orders (queued).
	ToDecide int64 `json:"to_decide"`
	// WaitingForStock are approved but not reserved (reviewed or on_hold).
	WaitingForStock int64 `json:"waiting_for_stock"`
	// ToDispatch are approved with stock reserved (confirmed).
	ToDispatch int64 `json:"to_dispatch"`
	// InTransit are dispatched and not yet received by the district.
	InTransit  int64 `json:"in_transit"`
	Dispatched int64 `json:"dispatched"`
	Rejected   int64 `json:"rejected"`
	// DispatchedInFull are dispatched orders that sent at least the quantity the district asked for.
	DispatchedInFull int64 `json:"dispatched_in_full"`
	// DistrictsSupplied counts the district stores sent stock.
	DistrictsSupplied int64 `json:"districts_supplied"`
	// ReceivedShort are receipts where the district counted less than was dispatched.
	ReceivedShort int64 `json:"received_short"`
	// MedianDaysToDispatch is from the district's order to its dispatch, for orders dispatched in the period.
	MedianDaysToDispatch *float64 `json:"median_days_to_dispatch"`
}

// inMovementPeriod and inEventPeriod bound a ledger entry and a workflow step by the period ($2 from, $3 to).
const (
	inMovementPeriod = `($2::timestamptz IS NULL OR m.created_at >= $2) AND ($3::timestamptz IS NULL OR m.created_at < $3)`
	inEventPeriod    = `($2::timestamptz IS NULL OR e.created_at >= $2) AND ($3::timestamptz IS NULL OR e.created_at < $3)`
)

func (r *Repository) storeSummary(ctx context.Context, storeID string, p period, now time.Time) (StoreSummary, error) {
	summary := StoreSummary{StoreID: storeID, Products: []StoreProductSummary{}}
	err := r.db.QueryRow(ctx, `SELECT name, store_type FROM stores WHERE id = $1`, storeID).
		Scan(&summary.StoreName, &summary.StoreType)
	if errors.Is(err, pgx.ErrNoRows) {
		return summary, errStoreNotFound
	}
	if err != nil {
		return summary, err
	}

	rows, err := r.db.Query(ctx, `SELECT b.condom_id, `+productName+`, b.unit_of_measure_id, um.name, b.on_hand, b.reserved,
			COALESCE(sum(m.quantity) FILTER (WHERE m.reason = 'receipt' AND `+inMovementPeriod+`), 0),
			COALESCE(-sum(m.quantity) FILTER (WHERE m.reason = 'dispatch' AND `+inMovementPeriod+`), 0),
			COALESCE(-sum(m.quantity) FILTER (WHERE m.reason = 'adjustment' AND m.quantity < 0 AND `+inMovementPeriod+`), 0),
			COALESCE(-sum(m.quantity) FILTER (WHERE m.reason = 'dispatch' AND m.created_at >= $4), 0)
		FROM order_store_stock b
		JOIN condoms c ON c.id = b.condom_id
		JOIN unit_of_measures um ON um.id = b.unit_of_measure_id
		LEFT JOIN inventory_movements m ON m.store_id = b.store_id AND m.condom_id = b.condom_id
			AND m.unit_of_measure_id = b.unit_of_measure_id
		WHERE b.store_id = $1
		GROUP BY b.condom_id, c.brand_id, c.type_id, c.category, b.unit_of_measure_id, um.name, b.on_hand, b.reserved
		ORDER BY 2, 4`, storeID, p.from, p.to, now.AddDate(0, 0, -90))
	if err != nil {
		return summary, err
	}
	products, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (StoreProductSummary, error) {
		var s StoreProductSummary
		err := row.Scan(&s.CondomID, &s.Product, &s.UnitOfMeasureID, &s.Unit, &s.OnHand, &s.Reserved,
			&s.Received, &s.Dispatched, &s.WrittenOff, &s.Dispatched90Days)
		return s, err
	})
	if err != nil {
		return summary, err
	}

	// Shelf life comes from the batches, banded the way the batch list bands them.
	batches, err := r.batches(ctx, scope{allStores: true}, StockFilter{StoreID: &storeID}, now)
	if err != nil {
		return summary, err
	}
	for i := range products {
		s := &products[i]
		for _, b := range batches {
			if b.CondomID != s.CondomID || b.UnitOfMeasureID != s.UnitOfMeasureID {
				continue
			}
			switch b.Band {
			case "expired":
				s.Expired += b.OnHand
			case "under_1_month", "under_3_months":
				s.Expiring += b.OnHand
			case "unknown":
				s.NoExpiry += b.OnHand
			}
			// Batches come earliest expiry first, so the first unexpired one with a date is the next to expire.
			if s.NextExpiry == nil && b.Band != "expired" && b.ExpiryDate != nil {
				s.NextExpiry = b.ExpiryDate
			}
		}
		s.Usable = max(0, s.OnHand-s.Reserved-s.Expired)
	}
	summary.Products = products

	// Orders from district stores; hotspot alert orders and the removed generic orders are not the warehouse's,
	// and stock sent without an order answers no request (its quantity still counts as dispatched above).
	o := &summary.Orders
	err = r.db.QueryRow(ctx, `WITH placed AS (
			SELECT * FROM orders WHERE ordered_from_store_id = $1 AND hot_spot_id IS NULL AND NOT unrequested
				AND order_status NOT IN ('pending', 'fulfilled')),
		steps AS (
			SELECT e.action, e.created_at AS at, p.* FROM order_events e JOIN placed p ON p.id = e.order_id
			WHERE e.action IN ('dispatch', 'reject', 'receive') AND `+inEventPeriod+`)
		SELECT
			(SELECT count(*) FROM placed WHERE order_status = 'queued'),
			(SELECT count(*) FROM placed WHERE order_status IN ('reviewed', 'on_hold')),
			(SELECT count(*) FROM placed WHERE order_status = 'confirmed'),
			(SELECT count(*) FROM placed WHERE order_status = 'dispatched'),
			(SELECT count(*) FROM steps WHERE action = 'dispatch'),
			(SELECT count(*) FROM steps WHERE action = 'reject'),
			(SELECT count(*) FROM steps WHERE action = 'dispatch' AND quantity_issued >= quantity_needed),
			(SELECT count(DISTINCT ordered_for_store_id) FROM steps WHERE action = 'dispatch'),
			(SELECT count(*) FROM steps WHERE action = 'receive' AND quantity_received < quantity_issued),
			(SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM at - created_at) / 86400)
				FROM steps WHERE action = 'dispatch')`, storeID, p.from, p.to).
		Scan(&o.ToDecide, &o.WaitingForStock, &o.ToDispatch, &o.InTransit, &o.Dispatched, &o.Rejected,
			&o.DispatchedInFull, &o.DistrictsSupplied, &o.ReceivedShort, &o.MedianDaysToDispatch)
	return summary, err
}
