package orders

import (
	"context"
	"errors"
	"strings"
	"time"

	"clims-backend/internal/features/notifications"

	"github.com/jackc/pgx/v5"
)

// StockoutReport is a hotspot's report that it has run out of a product. It is a notification to the
// DCFPs of the hotspot's district, not an order: they decide whether to order stock from NMS or JMS.
type StockoutReport struct {
	ID              string          `json:"id"`
	HotSpotID       string          `json:"hot_spot_id"`
	HotSpot         StockoutHotSpot `json:"hot_spot"`
	CondomID        string          `json:"condom_id"`
	Product         string          `json:"product"`
	DistrictStoreID string          `json:"district_store_id"`
	ReportedByID    string          `json:"reported_by_id"`
	ReportedBy      string          `json:"reported_by"`
	Comment         *string         `json:"comment"`
	CreatedAt       time.Time       `json:"created_at"`
}

// StockoutHotSpot is what a DCFP needs to know about the hotspot to follow up the report.
type StockoutHotSpot struct {
	Name         string  `json:"name"`
	Village      *string `json:"village"`
	Subcounty    *string `json:"subcounty"`
	District     *string `json:"district"`
	ContactName  *string `json:"contact_name"`
	ContactPhone *string `json:"contact_phone"`
}

const reportColumns = `r.id, r.hot_spot_id, coalesce(h.name, 'a hotspot'), h.village, sc.name, d.name, cp.name,
	cp.phone_number, r.condom_id, ` + productLabel + `, r.district_store_id, r.reported_by_id,
	coalesce(nullif(btrim(concat_ws(' ', u.firstname, u.lastname)), ''), u.username, 'someone'),
	r.comment, r.created_at`

const reportTables = ` FROM stockout_reports r
	JOIN hot_spots h ON h.id = r.hot_spot_id
	JOIN condoms c ON c.id = r.condom_id
	JOIN users u ON u.id = r.reported_by_id
	LEFT JOIN districts d ON d.id = h.district_id
	LEFT JOIN subcounties sc ON sc.id = h.subcounty_id
	LEFT JOIN LATERAL (SELECT name, phone_number FROM contact_persons
		WHERE hot_spot_id = h.id ORDER BY created_at DESC, id DESC LIMIT 1) cp ON true`

func scanReport(row pgx.Row) (StockoutReport, error) {
	var s StockoutReport
	err := row.Scan(&s.ID, &s.HotSpotID, &s.HotSpot.Name, &s.HotSpot.Village, &s.HotSpot.Subcounty,
		&s.HotSpot.District, &s.HotSpot.ContactName, &s.HotSpot.ContactPhone, &s.CondomID, &s.Product,
		&s.DistrictStoreID, &s.ReportedByID, &s.ReportedBy, &s.Comment, &s.CreatedAt)
	if s.Product == "" {
		s.Product = "condoms"
	}
	return s, err
}

// reportStockout records a hotspot's stockout and notifies the DCFPs at its district's store. It
// creates no order: ordering stock from a warehouse is the DCFP's separate decision.
func (r *Repository) reportStockout(ctx context.Context, actorID, hotSpotID, condomID string, comment *string) (StockoutReport, error) {
	var report StockoutReport
	err := pgx.BeginFunc(ctx, r.db, func(tx pgx.Tx) error {
		if err := checkOrderable(ctx, tx, condomID); err != nil {
			return err
		}
		var id string
		err := tx.QueryRow(ctx, `
			INSERT INTO stockout_reports (hot_spot_id, condom_id, district_store_id, reported_by_id, comment)
			SELECT h.id, $2, s.id, $3, $4
			FROM hot_spots h JOIN stores s ON s.store_type = 'district' AND s.district_id = h.district_id
			WHERE h.id = $1
			RETURNING id`, hotSpotID, condomID, actorID, comment).Scan(&id)
		if errors.Is(err, pgx.ErrNoRows) {
			return errHotSpotRoute
		}
		if err != nil {
			return err
		}
		if report, err = scanReport(tx.QueryRow(ctx, `SELECT `+reportColumns+reportTables+` WHERE r.id = $1`, id)); err != nil {
			return err
		}
		return r.notifier.Notify(ctx, tx, notifications.Message{
			Type: "order.stockout_reported",
			// DCFPs are the people at the district store who can order from the warehouse.
			Targets:        []notifications.Target{{Permission: "orders:replenish", StoreID: report.DistrictStoreID}},
			ActorID:        &actorID,
			Resource:       &notifications.Resource{Type: "hotspot", ID: report.HotSpotID},
			Data:           stockoutData(report),
			IdempotencyKey: report.ID,
		})
	})
	return report, err
}

// stockoutData is the notification's template data. Every key is always present, since templates
// treat a missing key as an error; details the hotspot lacks are empty strings.
func stockoutData(s StockoutReport) map[string]any {
	text := func(value *string) string {
		if value == nil {
			return ""
		}
		return strings.TrimSpace(*value)
	}
	place := make([]string, 0, 3)
	for _, part := range []*string{s.HotSpot.Village, s.HotSpot.Subcounty, s.HotSpot.District} {
		if value := text(part); value != "" {
			place = append(place, value)
		}
	}
	contact := text(s.HotSpot.ContactName)
	if phone := text(s.HotSpot.ContactPhone); phone != "" {
		if contact == "" {
			contact = phone
		} else {
			contact += " (" + phone + ")"
		}
	}
	return map[string]any{
		"report_id": s.ID, "hotspot_id": s.HotSpotID, "hotspot": s.HotSpot.Name, "place": strings.Join(place, ", "),
		"village": text(s.HotSpot.Village), "subcounty": text(s.HotSpot.Subcounty), "district": text(s.HotSpot.District),
		"contact": contact, "contact_name": text(s.HotSpot.ContactName), "contact_phone": text(s.HotSpot.ContactPhone),
		"condom_id": s.CondomID, "product": s.Product, "reporter": s.ReportedBy, "message": text(s.Comment),
	}
}

// listStockouts returns the reports the user can see, newest first: their district store's, their
// hotspot's, or the ones they sent. orders:all_stores sees every report.
func (r *Repository) listStockouts(ctx context.Context, access scope, hotSpotID *string, limit, offset int32) ([]StockoutReport, error) {
	rows, err := r.db.Query(ctx, `SELECT `+reportColumns+reportTables+`
		WHERE ($1::boolean OR r.district_store_id = $2::uuid OR r.hot_spot_id = $3::uuid OR r.reported_by_id = $4::uuid)
			AND ($5::uuid IS NULL OR r.hot_spot_id = $5)
		ORDER BY r.created_at DESC, r.id DESC LIMIT $6 OFFSET $7`,
		access.allStores, access.storeID, access.hotSpotID, access.userID, hotSpotID, limit, offset)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (StockoutReport, error) {
		return scanReport(row)
	})
}
