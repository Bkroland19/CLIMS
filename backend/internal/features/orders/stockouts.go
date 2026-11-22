package orders

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"clims-backend/internal/features/audit"
	"clims-backend/internal/features/notifications"
	"clims-backend/internal/features/stock"

	"github.com/jackc/pgx/v5"
)

var (
	errReportNotFound   = errors.New("stockout notification not found")
	errNoCategory       = errors.New("this product has no Male or Female category; send selection instead")
	errNotSelected      = errors.New("a delivery line's product type is not in the notification's selection")
	errDeliveryUnit     = errors.New("deliver in the product's catalogue unit, so pieces can be counted")
	errNotEnoughStock   = errors.New("not enough available stock at the district store for this delivery")
	errAlreadyFulfilled = errors.New("this notification is already fulfilled")
	errAckChanged       = errors.New("this line was already acknowledged with a different count")
	errNotManager       = errors.New("only the hotspot's manager can acknowledge its deliveries")
)

// Selections a notification can carry. A hotspot notification names the type it is out of and no quantity.
const (
	SelectionMale   = "male"
	SelectionFemale = "female"
	SelectionBoth   = "both"
)

// ValidSelection reports whether s is male, female or both.
func ValidSelection(s string) bool {
	return s == SelectionMale || s == SelectionFemale || s == SelectionBoth
}

// combineSelections is the selection after a hotspot repeats a notification: Male then Female is Both.
func combineSelections(a, b string) string {
	if a == b {
		return a
	}
	return SelectionBoth
}

// selected reports whether a product category is part of a selection.
func selected(selection, category string) bool {
	return selection == SelectionBoth || selection == category
}

func selectionLabel(selection string) string {
	switch selection {
	case SelectionMale:
		return "male condoms"
	case SelectionFemale:
		return "female condoms"
	}
	return "male and female condoms"
}

// StockoutReport is a hotspot's notification that it has run out of Male, Female or Both condoms. It
// carries no quantity: the district decides what to deliver, and the hotspot's manager acknowledges
// what arrived. It is fulfilled once every selected type has a positive acknowledgement.
type StockoutReport struct {
	ID              string          `json:"id"`
	HotSpotID       string          `json:"hot_spot_id"`
	HotSpot         StockoutHotSpot `json:"hot_spot"`
	Selection       string          `json:"selection"`
	CondomID        *string         `json:"condom_id"`
	Product         string          `json:"product"`
	DistrictStoreID string          `json:"district_store_id"`
	ReportedByID    string          `json:"reported_by_id"`
	ReportedBy      string          `json:"reported_by"`
	Comment         *string         `json:"comment"`
	RepeatCount     int             `json:"repeat_count"`
	LastReportedAt  time.Time       `json:"last_reported_at"`
	Status          string          `json:"status"`
	FulfilledAt     *time.Time      `json:"fulfilled_at"`
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

// NotificationFacts is a LATERAL join, aliased f, of what has been delivered and acknowledged per type
// for the stockout report r. The reports module reads the same facts, so screens and reports agree.
const NotificationFacts = ` LEFT JOIN LATERAL (SELECT
		count(l.id) AS lines,
		coalesce(bool_or(l.category = 'male' AND l.acknowledged_pieces > 0), false) AS acked_male,
		coalesce(bool_or(l.category = 'female' AND l.acknowledged_pieces > 0), false) AS acked_female,
		coalesce(sum(l.pieces) FILTER (WHERE l.category = 'male'), 0) AS delivered_male,
		coalesce(sum(l.pieces) FILTER (WHERE l.category = 'female'), 0) AS delivered_female,
		coalesce(sum(l.acknowledged_pieces) FILTER (WHERE l.category = 'male'), 0) AS received_male,
		coalesce(sum(l.acknowledged_pieces) FILTER (WHERE l.category = 'female'), 0) AS received_female,
		count(l.id) FILTER (WHERE l.acknowledged_at IS NULL) AS unacknowledged_lines,
		min(d.created_at) FILTER (WHERE l.acknowledged_at IS NULL) AS oldest_unacknowledged_at
	FROM hotspot_deliveries d JOIN hotspot_delivery_lines l ON l.delivery_id = d.id
	WHERE d.stockout_report_id = r.id) f ON true`

// NotificationStatus derives a notification's status from r and NotificationFacts f:
// fulfilled, partly_received, awaiting_acknowledgement or awaiting_supply.
const NotificationStatus = `CASE WHEN r.fulfilled_at IS NOT NULL THEN 'fulfilled'
	WHEN f.acked_male OR f.acked_female THEN 'partly_received'
	WHEN f.lines > 0 THEN 'awaiting_acknowledgement'
	ELSE 'awaiting_supply' END`

const reportColumns = `r.id, r.hot_spot_id, coalesce(h.name, 'a hotspot'), h.village, sc.name, d.name, cp.name,
	cp.phone_number, r.selection, r.condom_id, ` + productLabel + `, r.district_store_id, r.reported_by_id,
	coalesce(nullif(btrim(concat_ws(' ', u.firstname, u.lastname)), ''), u.username, 'someone'),
	r.comment, r.repeat_count, r.last_reported_at, ` + NotificationStatus + `, r.fulfilled_at, r.created_at`

const reportTables = ` FROM stockout_reports r
	JOIN hot_spots h ON h.id = r.hot_spot_id
	LEFT JOIN condoms c ON c.id = r.condom_id
	JOIN users u ON u.id = r.reported_by_id
	LEFT JOIN districts d ON d.id = h.district_id
	LEFT JOIN subcounties sc ON sc.id = h.subcounty_id
	LEFT JOIN LATERAL (SELECT name, phone_number FROM contact_persons
		WHERE hot_spot_id = h.id ORDER BY created_at DESC, id DESC LIMIT 1) cp ON true` + NotificationFacts

// visibleReports limits reports to the user's district store, their hotspot, or the ones they sent;
// orders:all_stores sees every report. $1 all stores, $2 store, $3 hotspot, $4 user.
const visibleReports = `($1::boolean OR r.district_store_id = $2::uuid OR r.hot_spot_id = $3::uuid OR r.reported_by_id = $4::uuid)`

type rowQuerier interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}

func scanReport(row pgx.Row) (StockoutReport, error) {
	var s StockoutReport
	err := row.Scan(&s.ID, &s.HotSpotID, &s.HotSpot.Name, &s.HotSpot.Village, &s.HotSpot.Subcounty,
		&s.HotSpot.District, &s.HotSpot.ContactName, &s.HotSpot.ContactPhone, &s.Selection, &s.CondomID, &s.Product,
		&s.DistrictStoreID, &s.ReportedByID, &s.ReportedBy, &s.Comment, &s.RepeatCount, &s.LastReportedAt,
		&s.Status, &s.FulfilledAt, &s.CreatedAt)
	if s.Product == "" {
		s.Product = selectionLabel(s.Selection)
	}
	return s, err
}

func getReport(ctx context.Context, q rowQuerier, id string) (StockoutReport, error) {
	return scanReport(q.QueryRow(ctx, `SELECT `+reportColumns+reportTables+` WHERE r.id = $1`, id))
}

// reportStockout records a hotspot's stockout and notifies the DCFPs at its district's store. A hotspot
// with an open notification does not raise a second one: the message is counted against the open
// notification, whose selection widens if a new type is named (Male then Female is Both). The second
// result is true for such a repeat.
func (r *Repository) reportStockout(ctx context.Context, actorID, hotSpotID string, condomID *string, selection string, comment *string) (StockoutReport, bool, error) {
	var report StockoutReport
	var repeated bool
	err := pgx.BeginFunc(ctx, r.db, func(tx pgx.Tx) error {
		if condomID != nil {
			if err := checkOrderable(ctx, tx, *condomID); err != nil {
				return err
			}
			var category *string
			err := tx.QueryRow(ctx, `SELECT category FROM condoms WHERE id = $1`, *condomID).Scan(&category)
			if errors.Is(err, pgx.ErrNoRows) {
				return errUnknownProduct
			}
			if err != nil {
				return err
			}
			if category == nil || (*category != SelectionMale && *category != SelectionFemale) {
				return errNoCategory
			}
			if selection == "" {
				selection = *category
			}
		}
		// Locking the hotspot serialises its notifications, so two sends cannot open two at once.
		var storeID string
		err := tx.QueryRow(ctx, `SELECT s.id FROM hot_spots h
			JOIN stores s ON s.store_type = 'district' AND s.district_id = h.district_id
			WHERE h.id = $1 FOR UPDATE OF h`, hotSpotID).Scan(&storeID)
		if errors.Is(err, pgx.ErrNoRows) {
			return errHotSpotRoute
		}
		if err != nil {
			return err
		}
		var id, openSelection string
		err = tx.QueryRow(ctx, `SELECT id, selection FROM stockout_reports
			WHERE hot_spot_id = $1 AND fulfilled_at IS NULL ORDER BY created_at DESC, id DESC LIMIT 1`,
			hotSpotID).Scan(&id, &openSelection)
		switch {
		case errors.Is(err, pgx.ErrNoRows):
			if err = tx.QueryRow(ctx, `INSERT INTO stockout_reports
					(hot_spot_id, condom_id, selection, district_store_id, reported_by_id, comment)
				VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
				hotSpotID, condomID, selection, storeID, actorID, comment).Scan(&id); err != nil {
				return err
			}
			if err = addReportEvent(ctx, tx, id, actorID, "raised", selection, map[string]any{"comment": comment}); err != nil {
				return err
			}
		case err != nil:
			return err
		default:
			repeated = true
			combined := combineSelections(openSelection, selection)
			action := "repeated"
			if combined != openSelection {
				action = "selection_changed"
			}
			if _, err = tx.Exec(ctx, `UPDATE stockout_reports SET repeat_count = repeat_count + 1,
				last_reported_at = CURRENT_TIMESTAMP, selection = $2 WHERE id = $1`, id, combined); err != nil {
				return err
			}
			if err = addReportEvent(ctx, tx, id, actorID, action, combined,
				map[string]any{"from": openSelection, "reported": selection, "comment": comment}); err != nil {
				return err
			}
		}
		if report, err = getReport(ctx, tx, id); err != nil {
			return err
		}
		entry := audit.Entry{Action: "stockout.reported", Target: &audit.Subject{Type: "stockout_report", ID: report.ID},
			Related: []audit.Subject{{Type: "hotspot", ID: report.HotSpotID}, {Type: "store", ID: report.DistrictStoreID}},
			Details: map[string]any{"selection": selection, "comment": comment}}
		if repeated {
			// A repeat adds to the hotspot's open report rather than raising another.
			entry.Action = "stockout.repeated"
			entry.Details["repeat_count"] = report.RepeatCount
			entry.Details["combined_selection"] = report.Selection
		}
		if condomID != nil {
			entry.Related = append(entry.Related, audit.Subject{Type: "product", ID: *condomID})
		}
		if err = r.audit.Record(ctx, tx, entry); err != nil {
			return err
		}
		return r.notifier.Notify(ctx, tx, notifications.Message{
			Type: "order.stockout_reported",
			// DCFPs are the people at the district store who can order from the warehouse.
			Targets:        []notifications.Target{{Permission: "orders:replenish", StoreID: report.DistrictStoreID}},
			ActorID:        &actorID,
			Resource:       &notifications.Resource{Type: "hotspot", ID: report.HotSpotID},
			Data:           stockoutData(report),
			IdempotencyKey: fmt.Sprintf("%s:%d", report.ID, report.RepeatCount),
		})
	})
	return report, repeated, err
}

func addReportEvent(ctx context.Context, tx pgx.Tx, reportID, actorID, action, selection string, data map[string]any) error {
	_, err := tx.Exec(ctx, `INSERT INTO stockout_report_events (report_id, actor_id, action, selection, data)
		VALUES ($1, $2, $3, $4, $5)`, reportID, actorID, action, selection, data)
	return err
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
	condomID := ""
	if s.CondomID != nil {
		condomID = *s.CondomID
	}
	return map[string]any{
		"report_id": s.ID, "hotspot_id": s.HotSpotID, "hotspot": s.HotSpot.Name, "place": strings.Join(place, ", "),
		"village": text(s.HotSpot.Village), "subcounty": text(s.HotSpot.Subcounty), "district": text(s.HotSpot.District),
		"contact": contact, "contact_name": text(s.HotSpot.ContactName), "contact_phone": text(s.HotSpot.ContactPhone),
		"condom_id": condomID, "product": s.Product, "selection": s.Selection, "reporter": s.ReportedBy,
		"message": text(s.Comment), "repeat_count": s.RepeatCount,
	}
}

// listStockouts returns the reports the user can see, newest first: their district store's, their
// hotspot's, or the ones they sent. orders:all_stores sees every report.
func (r *Repository) listStockouts(ctx context.Context, access scope, hotSpotID *string, limit, offset int32) ([]StockoutReport, error) {
	rows, err := r.db.Query(ctx, `SELECT `+reportColumns+reportTables+`
		WHERE `+visibleReports+` AND ($5::uuid IS NULL OR r.hot_spot_id = $5)
		ORDER BY r.created_at DESC, r.id DESC LIMIT $6 OFFSET $7`,
		access.allStores, access.storeID, access.hotSpotID, access.userID, hotSpotID, limit, offset)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (StockoutReport, error) {
		return scanReport(row)
	})
}

// DeliveryLine is one product sent to a hotspot, in the product's unit and in pieces, with the
// manager's acknowledgement once recorded.
type DeliveryLine struct {
	ID                 string     `json:"id"`
	Category           string     `json:"category"`
	CondomID           string     `json:"condom_id"`
	Product            string     `json:"product"`
	UnitOfMeasureID    string     `json:"unit_of_measure_id"`
	Quantity           int32      `json:"quantity"`
	Pieces             int32      `json:"pieces"`
	AcknowledgedPieces *int32     `json:"acknowledged_pieces"`
	AcknowledgedByID   *string    `json:"acknowledged_by_id"`
	AcknowledgedAt     *time.Time `json:"acknowledged_at"`
}

type Delivery struct {
	ID              string         `json:"id"`
	DeliveredByID   string         `json:"delivered_by_id"`
	Note            *string        `json:"note"`
	ClientReference *string        `json:"client_reference"`
	CreatedAt       time.Time      `json:"created_at"`
	Lines           []DeliveryLine `json:"lines"`
}

type ReportEvent struct {
	ID        string         `json:"id"`
	ActorID   *string        `json:"actor_id"`
	Action    string         `json:"action"`
	Selection string         `json:"selection"`
	Data      map[string]any `json:"data"`
	CreatedAt time.Time      `json:"created_at"`
}

// StockoutDetail is a notification with the deliveries, acknowledgements and history behind its status.
type StockoutDetail struct {
	StockoutReport
	Deliveries []Delivery    `json:"deliveries"`
	Events     []ReportEvent `json:"events"`
}

func (r *Repository) getStockout(ctx context.Context, access scope, id string) (StockoutDetail, error) {
	report, err := scanReport(r.db.QueryRow(ctx, `SELECT `+reportColumns+reportTables+` WHERE `+visibleReports+
		` AND r.id = $5`, access.allStores, access.storeID, access.hotSpotID, access.userID, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return StockoutDetail{}, errReportNotFound
	}
	if err != nil {
		return StockoutDetail{}, err
	}
	return r.detail(ctx, r.db, report)
}

func (r *Repository) detail(ctx context.Context, q interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
}, report StockoutReport) (StockoutDetail, error) {
	detail := StockoutDetail{StockoutReport: report, Deliveries: []Delivery{}}
	rows, err := q.Query(ctx, `SELECT d.id, d.delivered_by_id, d.note, d.client_reference, d.created_at,
			l.id, l.category, l.condom_id, `+productLabel+`, l.unit_of_measure_id, l.quantity, l.pieces,
			l.acknowledged_pieces, l.acknowledged_by_id, l.acknowledged_at
		FROM hotspot_deliveries d JOIN hotspot_delivery_lines l ON l.delivery_id = d.id
		JOIN condoms c ON c.id = l.condom_id
		WHERE d.stockout_report_id = $1 ORDER BY d.created_at, d.id, l.category, l.id`, report.ID)
	if err != nil {
		return StockoutDetail{}, err
	}
	defer rows.Close()
	for rows.Next() {
		var d Delivery
		var l DeliveryLine
		if err = rows.Scan(&d.ID, &d.DeliveredByID, &d.Note, &d.ClientReference, &d.CreatedAt, &l.ID, &l.Category,
			&l.CondomID, &l.Product, &l.UnitOfMeasureID, &l.Quantity, &l.Pieces, &l.AcknowledgedPieces,
			&l.AcknowledgedByID, &l.AcknowledgedAt); err != nil {
			return StockoutDetail{}, err
		}
		if n := len(detail.Deliveries); n == 0 || detail.Deliveries[n-1].ID != d.ID {
			detail.Deliveries = append(detail.Deliveries, d)
		}
		last := &detail.Deliveries[len(detail.Deliveries)-1]
		last.Lines = append(last.Lines, l)
	}
	if err = rows.Err(); err != nil {
		return StockoutDetail{}, err
	}
	events, err := q.Query(ctx, `SELECT id, actor_id, action, selection, data, created_at FROM stockout_report_events
		WHERE report_id = $1 ORDER BY created_at, id`, report.ID)
	if err != nil {
		return StockoutDetail{}, err
	}
	detail.Events, err = pgx.CollectRows(events, pgx.RowToStructByPos[ReportEvent])
	return detail, err
}

// DeliveryInput is a district's delivery to a hotspot against its notification. Each line is a
// product in its catalogue unit; ClientReference makes a retried send record the delivery once.
type DeliveryInput struct {
	Lines []struct {
		CondomID        string  `json:"condom_id"`
		Quantity        int32   `json:"quantity"`
		UnitOfMeasureID *string `json:"unit_of_measure_id"`
	} `json:"lines"`
	Note            *string `json:"note"`
	ClientReference *string `json:"client_reference"`
	// ExpiryExceptionReason documents delivering a batch with under one month left.
	ExpiryExceptionReason *string `json:"expiry_exception_reason"`
}

// recordDelivery takes each line out of the district store's available stock, records it against the
// notification and the inventory ledger, and tells the hotspot's manager to acknowledge what arrives.
// The second result is false when a retried send matched an existing delivery.
func (r *Repository) recordDelivery(ctx context.Context, access scope, reportID string, in DeliveryInput) (StockoutDetail, bool, error) {
	var detail StockoutDetail
	created := true
	err := pgx.BeginFunc(ctx, r.db, func(tx pgx.Tx) error {
		var storeID, hotSpotID, selection string
		var fulfilledAt *time.Time
		err := tx.QueryRow(ctx, `SELECT district_store_id, hot_spot_id, selection, fulfilled_at
			FROM stockout_reports WHERE id = $1 FOR UPDATE`, reportID).Scan(&storeID, &hotSpotID, &selection, &fulfilledAt)
		if errors.Is(err, pgx.ErrNoRows) {
			return errReportNotFound
		}
		if err != nil {
			return err
		}
		if !access.allStores && !assigned(access.storeID, storeID) {
			return errReportNotFound
		}
		var deliveryID string
		if in.ClientReference != nil {
			err = tx.QueryRow(ctx, `SELECT id FROM hotspot_deliveries WHERE stockout_report_id = $1 AND client_reference = $2`,
				reportID, *in.ClientReference).Scan(&deliveryID)
			if err == nil {
				created = false
			} else if !errors.Is(err, pgx.ErrNoRows) {
				return err
			}
		}
		if created {
			if fulfilledAt != nil {
				return errAlreadyFulfilled
			}
			if deliveryID, err = r.deliver(ctx, tx, access.userID, reportID, storeID, selection, in); err != nil {
				return err
			}
		}
		report, err := getReport(ctx, tx, reportID)
		if err != nil {
			return err
		}
		if detail, err = r.detail(ctx, tx, report); err != nil {
			return err
		}
		if !created {
			return nil
		}
		return r.notifyManagers(ctx, tx, access.userID, report, deliveryID, detail)
	})
	return detail, created, err
}

func (r *Repository) deliver(ctx context.Context, tx pgx.Tx, actorID, reportID, storeID, selection string, in DeliveryInput) (string, error) {
	var deliveryID string
	if err := tx.QueryRow(ctx, `INSERT INTO hotspot_deliveries (stockout_report_id, district_store_id, delivered_by_id, note, client_reference)
		VALUES ($1, $2, $3, $4, $5) RETURNING id`, reportID, storeID, actorID, in.Note, in.ClientReference).Scan(&deliveryID); err != nil {
		return "", err
	}
	summary := make([]map[string]any, 0, len(in.Lines))
	for _, line := range in.Lines {
		var category, unitID *string
		var piecesPerUnit *int32
		var active bool
		err := tx.QueryRow(ctx, `SELECT category, unit_id, pieces_per_unit, active FROM condoms WHERE id = $1`,
			line.CondomID).Scan(&category, &unitID, &piecesPerUnit, &active)
		if errors.Is(err, pgx.ErrNoRows) {
			return "", errUnknownProduct
		}
		if err != nil {
			return "", err
		}
		if !active {
			return "", errInactiveProduct
		}
		if category == nil || !selected(selection, *category) {
			return "", errNotSelected
		}
		if unitID == nil || piecesPerUnit == nil || (line.UnitOfMeasureID != nil && *line.UnitOfMeasureID != *unitID) {
			return "", errDeliveryUnit
		}
		var onHand int64
		err = tx.QueryRow(ctx, `UPDATE order_store_stock SET on_hand = on_hand - $4, updated_at = CURRENT_TIMESTAMP
			WHERE store_id = $1 AND condom_id = $2 AND unit_of_measure_id = $3 AND on_hand - reserved >= $4
			RETURNING on_hand`, storeID, line.CondomID, *unitID, line.Quantity).Scan(&onHand)
		if errors.Is(err, pgx.ErrNoRows) {
			return "", errNotEnoughStock
		}
		if err != nil {
			return "", err
		}
		pieces := int64(line.Quantity) * int64(*piecesPerUnit)
		if pieces > 2_000_000_000 {
			return "", errWorkflowInput
		}
		// Stock leaves first-expiry-first-out; expired batches stay behind.
		taken, err := stock.Take(ctx, tx, storeID, line.CondomID, *unitID, int64(line.Quantity), stock.Today(time.Now()),
			in.ExpiryExceptionReason)
		if errors.Is(err, stock.ErrShort) {
			return "", errExpiredStock
		}
		if err != nil {
			return "", err
		}
		var lineID string
		if err = tx.QueryRow(ctx, `INSERT INTO hotspot_delivery_lines (delivery_id, category, condom_id, unit_of_measure_id, quantity, pieces)
			VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`, deliveryID, *category, line.CondomID, *unitID, line.Quantity,
			pieces).Scan(&lineID); err != nil {
			return "", err
		}
		if err = stock.Ship(ctx, tx, taken, nil, &lineID, &deliveryID, actorID, in.ExpiryExceptionReason); err != nil {
			return "", err
		}
		if _, err = tx.Exec(ctx, `INSERT INTO inventory_movements
				(store_id, condom_id, unit_of_measure_id, reason, quantity, on_hand_after, hotspot_delivery_id, actor_id)
			VALUES ($1, $2, $3, 'hotspot_delivery', $4, $5, $6, $7)`,
			storeID, line.CondomID, *unitID, -int64(line.Quantity), onHand, deliveryID, actorID); err != nil {
			return "", err
		}
		summary = append(summary, map[string]any{"category": *category, "pieces": pieces})
	}
	return deliveryID, addReportEvent(ctx, tx, reportID, actorID, "delivered", selection,
		map[string]any{"delivery_id": deliveryID, "lines": summary})
}

// piecesSummary describes delivery lines for a notification, e.g. "300 male and 100 female pieces".
func piecesSummary(lines []DeliveryLine, acknowledged bool) string {
	var male, female int64
	for _, l := range lines {
		pieces := int64(l.Pieces)
		if acknowledged {
			pieces = 0
			if l.AcknowledgedPieces != nil {
				pieces = int64(*l.AcknowledgedPieces)
			}
		}
		if l.Category == SelectionMale {
			male += pieces
		} else {
			female += pieces
		}
	}
	switch {
	case male > 0 && female > 0:
		return fmt.Sprintf("%d male and %d female pieces", male, female)
	case female > 0:
		return fmt.Sprintf("%d female pieces", female)
	}
	return fmt.Sprintf("%d male pieces", male)
}

// notifyManagers tells the hotspot's manager accounts that stock is on the way. A hotspot whose contact
// person has no account yet notifies nobody.
func (r *Repository) notifyManagers(ctx context.Context, tx pgx.Tx, actorID string, report StockoutReport, deliveryID string, detail StockoutDetail) error {
	rows, err := tx.Query(ctx, `SELECT id FROM users WHERE hot_spot_id = $1 AND status = 'active'`, report.HotSpotID)
	if err != nil {
		return err
	}
	managers, err := pgx.CollectRows(rows, pgx.RowTo[string])
	if err != nil || len(managers) == 0 {
		return err
	}
	var lines []DeliveryLine
	for _, d := range detail.Deliveries {
		if d.ID == deliveryID {
			lines = d.Lines
		}
	}
	return r.notifier.Notify(ctx, tx, notifications.Message{
		Type:           "order.hotspot_delivery",
		Targets:        []notifications.Target{{UserIDs: managers}},
		ActorID:        &actorID,
		Resource:       &notifications.Resource{Type: "hotspot", ID: report.HotSpotID},
		Data:           map[string]any{"report_id": report.ID, "hotspot": report.HotSpot.Name, "pieces": piecesSummary(lines, false)},
		IdempotencyKey: deliveryID,
	})
}

// AcknowledgementInput is the hotspot manager's count of pieces received per delivery line.
type AcknowledgementInput struct {
	Lines []struct {
		LineID string `json:"line_id"`
		Pieces int32  `json:"pieces"`
	} `json:"lines"`
}

// acknowledge records the manager's counts. Repeating a line's count is accepted once; a different
// count for an acknowledged line is refused, since corrections must stay visible. The notification is
// fulfilled when every selected type has a positive acknowledgement, and the district is told.
func (r *Repository) acknowledge(ctx context.Context, access scope, reportID string, in AcknowledgementInput) (StockoutDetail, error) {
	var detail StockoutDetail
	err := pgx.BeginFunc(ctx, r.db, func(tx pgx.Tx) error {
		var hotSpotID, selection string
		var fulfilledAt *time.Time
		err := tx.QueryRow(ctx, `SELECT hot_spot_id, selection, fulfilled_at FROM stockout_reports WHERE id = $1 FOR UPDATE`,
			reportID).Scan(&hotSpotID, &selection, &fulfilledAt)
		if errors.Is(err, pgx.ErrNoRows) {
			return errReportNotFound
		}
		if err != nil {
			return err
		}
		// Only the manager confirms receipt; district or national users cannot complete fulfilment.
		if !assigned(access.hotSpotID, hotSpotID) {
			return errNotManager
		}
		recorded := make([]map[string]any, 0, len(in.Lines))
		for _, line := range in.Lines {
			var existing *int32
			var category string
			err = tx.QueryRow(ctx, `SELECT l.acknowledged_pieces, l.category FROM hotspot_delivery_lines l
				JOIN hotspot_deliveries d ON d.id = l.delivery_id
				WHERE l.id = $1 AND d.stockout_report_id = $2 FOR UPDATE OF l`, line.LineID, reportID).Scan(&existing, &category)
			if errors.Is(err, pgx.ErrNoRows) {
				return errWorkflowInput
			}
			if err != nil {
				return err
			}
			if existing != nil {
				if *existing != line.Pieces {
					return errAckChanged
				}
				continue
			}
			if _, err = tx.Exec(ctx, `UPDATE hotspot_delivery_lines SET acknowledged_pieces = $2,
				acknowledged_by_id = $3, acknowledged_at = CURRENT_TIMESTAMP WHERE id = $1`,
				line.LineID, line.Pieces, access.userID); err != nil {
				return err
			}
			recorded = append(recorded, map[string]any{"line_id": line.LineID, "category": category, "pieces": line.Pieces})
		}
		if len(recorded) > 0 {
			if err = addReportEvent(ctx, tx, reportID, access.userID, "acknowledged", selection,
				map[string]any{"lines": recorded}); err != nil {
				return err
			}
			if fulfilledAt == nil {
				var complete bool
				if err = tx.QueryRow(ctx, `SELECT (r.selection = 'female' OR f.acked_male)
						AND (r.selection = 'male' OR f.acked_female)
					FROM stockout_reports r`+NotificationFacts+` WHERE r.id = $1`, reportID).Scan(&complete); err != nil {
					return err
				}
				if complete {
					if _, err = tx.Exec(ctx, `UPDATE stockout_reports SET fulfilled_at = CURRENT_TIMESTAMP WHERE id = $1`,
						reportID); err != nil {
						return err
					}
				}
			}
		}
		report, err := getReport(ctx, tx, reportID)
		if err != nil {
			return err
		}
		if detail, err = r.detail(ctx, tx, report); err != nil {
			return err
		}
		if len(recorded) == 0 {
			return nil
		}
		var lines []DeliveryLine
		for _, d := range detail.Deliveries {
			lines = append(lines, d.Lines...)
		}
		return r.notifier.Notify(ctx, tx, notifications.Message{
			Type:     "order.delivery_acknowledged",
			Targets:  []notifications.Target{{Permission: "orders:supply_hotspots", StoreID: report.DistrictStoreID}},
			ActorID:  &access.userID,
			Resource: &notifications.Resource{Type: "hotspot", ID: report.HotSpotID},
			Data: map[string]any{"report_id": report.ID, "hotspot": report.HotSpot.Name,
				"pieces": piecesSummary(lines, true), "fulfilled": report.Status == "fulfilled"},
			IdempotencyKey: fmt.Sprintf("%s:%d", report.ID, len(detail.Events)),
		})
	})
	return detail, err
}
