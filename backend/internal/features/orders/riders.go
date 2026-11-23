package orders

import (
	"context"
	"errors"
	"time"

	"clims-backend/internal/features/notifications"

	"github.com/jackc/pgx/v5"
)

// Rider is a delivery agent: who carries a district's delivery to a hotspot.
type Rider struct {
	ID    string  `json:"id"`
	Name  string  `json:"name"`
	Phone *string `json:"phone"`
}

// riderName is SQL naming the user aliased ru: their full name, or else their username.
const riderName = `COALESCE(NULLIF(TRIM(CONCAT_WS(' ', ru.firstname, ru.lastname)), ''), ru.username)`

// eligibleRiders is SQL for the users aliased ru who may carry a delivery from the district store
// $1: active, holding orders:deliver, and working in the store's district. A user's district is
// their store's, or else their subcounty's, as users.DistrictOfUser has it.
const eligibleRiders = ` FROM users ru
	LEFT JOIN stores rst ON rst.id = ru.store_id
	LEFT JOIN subcounties rsc ON rsc.id = ru.subcounty_id
	WHERE ru.status = 'active'
		AND COALESCE(rst.district_id, rsc.district_id) = (SELECT district_id FROM stores WHERE id = $1)
		AND EXISTS (SELECT 1 FROM role_user rur JOIN role_permission rrp ON rrp.role_id = rur.role_id
			JOIN permissions rp ON rp.id = rrp.permission_id
			WHERE rur.user_id = ru.id AND rp.name = 'orders:deliver')`

func riderOf(id, name, phone *string) *Rider {
	if id == nil {
		return nil
	}
	rider := &Rider{ID: *id, Phone: phone}
	if name != nil {
		rider.Name = *name
	}
	return rider
}

// eligibleRider reports whether riderID may carry a delivery from the district store storeID.
func eligibleRider(ctx context.Context, q rowQuerier, storeID, riderID string) (bool, error) {
	var ok bool
	err := q.QueryRow(ctx, `SELECT EXISTS (SELECT 1`+eligibleRiders+` AND ru.id = $2)`, storeID, riderID).Scan(&ok)
	return ok, err
}

// listRiders returns the delivery agents who may carry a delivery for the report, by name: those
// working in the district of the store the report went to.
func (r *Repository) listRiders(ctx context.Context, access scope, reportID string) ([]Rider, error) {
	var storeID string
	err := r.db.QueryRow(ctx, `SELECT district_store_id FROM stockout_reports WHERE id = $1`, reportID).Scan(&storeID)
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && !access.allStores && !assigned(access.storeID, storeID)) {
		return nil, errReportNotFound
	}
	if err != nil {
		return nil, err
	}
	rows, err := r.db.Query(ctx, `SELECT ru.id, `+riderName+`, ru.phone_number`+eligibleRiders+` ORDER BY 2, ru.id`,
		storeID)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowToStructByPos[Rider])
}

// RiderDelivery is a delivery named for the signed-in delivery agent: where it goes, who to call,
// what it carries, and whether the hotspot has confirmed it.
type RiderDelivery struct {
	ID               string    `json:"id"`
	StockoutReportID string    `json:"stockout_report_id"`
	Note             *string   `json:"note"`
	CreatedAt        time.Time `json:"created_at"`
	// HotSpot is the hotspot's details and latest contact person, as on its stockout report.
	HotSpot   StockoutHotSpot `json:"hot_spot"`
	HotSpotID string          `json:"hot_spot_id"`
	Lines     []DeliveryLine  `json:"lines"`
	// Acknowledged is true once the hotspot's manager has confirmed every line.
	Acknowledged bool `json:"acknowledged"`
}

// riderDeliveries returns the deliveries named for riderID, newest first.
func (r *Repository) riderDeliveries(ctx context.Context, riderID string, limit, offset int32) ([]RiderDelivery, error) {
	rows, err := r.db.Query(ctx, `SELECT id, stockout_report_id, note, created_at FROM hotspot_deliveries
		WHERE rider_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2 OFFSET $3`, riderID, limit, offset)
	if err != nil {
		return nil, err
	}
	deliveries, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (RiderDelivery, error) {
		var d RiderDelivery
		err := row.Scan(&d.ID, &d.StockoutReportID, &d.Note, &d.CreatedAt)
		return d, err
	})
	if err != nil {
		return nil, err
	}
	// A page is at most 100 deliveries, so two small queries each are fine.
	for i := range deliveries {
		d := &deliveries[i]
		report, err := getReport(ctx, r.db, d.StockoutReportID)
		if err != nil {
			return nil, err
		}
		d.HotSpotID, d.HotSpot = report.HotSpotID, report.HotSpot
		lines, err := r.db.Query(ctx, `SELECT l.id, l.category, l.condom_id, `+productLabel+`, l.unit_of_measure_id,
				l.quantity, l.pieces, l.acknowledged_pieces, l.acknowledged_by_id, l.acknowledged_at
			FROM hotspot_delivery_lines l JOIN condoms c ON c.id = l.condom_id
			WHERE l.delivery_id = $1 ORDER BY l.category, l.id`, d.ID)
		if err != nil {
			return nil, err
		}
		if d.Lines, err = pgx.CollectRows(lines, pgx.RowToStructByPos[DeliveryLine]); err != nil {
			return nil, err
		}
		d.Acknowledged = len(d.Lines) > 0
		for _, l := range d.Lines {
			if l.AcknowledgedPieces == nil {
				d.Acknowledged = false
			}
		}
	}
	return deliveries, nil
}

// notifyRider tells the delivery agent named for a delivery what to carry and where.
func (r *Repository) notifyRider(ctx context.Context, tx pgx.Tx, actorID string, report StockoutReport,
	deliveryID string, riderID *string, detail StockoutDetail) error {
	if riderID == nil {
		return nil
	}
	var lines []DeliveryLine
	for _, d := range detail.Deliveries {
		if d.ID == deliveryID {
			lines = d.Lines
		}
	}
	// stockoutData already names the report, hotspot, place and contact.
	data := stockoutData(report)
	data["delivery_id"] = deliveryID
	data["pieces"] = piecesSummary(lines, false)
	return r.notifier.Notify(ctx, tx, notifications.Message{
		Type:           "order.delivery_assigned",
		Targets:        []notifications.Target{{UserIDs: []string{*riderID}}},
		ActorID:        &actorID,
		Resource:       &notifications.Resource{Type: "hotspot", ID: report.HotSpotID},
		Data:           data,
		IdempotencyKey: "rider:" + deliveryID,
	})
}
