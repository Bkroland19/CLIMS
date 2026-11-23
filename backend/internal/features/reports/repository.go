// Package reports serves the programme reports defined in the reporting requirements (v0.2). Every
// figure is calculated from source records on request, using the same notification facts as the
// orders screens, so a total and the records behind it always agree.
package reports

import (
	"context"
	"time"

	"clims-backend/internal/features/orders"
	"clims-backend/internal/features/users"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Kampala is the reporting time zone (RN09). Uganda keeps East Africa Time all year, so a fixed
// offset is exact and needs no time zone database.
var Kampala = time.FixedZone("EAT", 3*60*60)

type Repository struct {
	db *pgxpool.Pool
}

func NewRepository(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}

// scope is what a user may report on (RN01): every notification, or those of their district store,
// their hotspot, the ones they sent, and for VHTs the district they work in.
type scope struct {
	all        bool
	storeID    *string
	hotSpotID  *string
	userID     string
	districtID *string
}

func (r *Repository) scopeFor(ctx context.Context, user *users.User) (scope, error) {
	s := scope{all: user.HasPermission("orders:all_stores"), storeID: user.StoreID, hotSpotID: user.HotSpotID, userID: user.ID}
	if user.HasPermission("orders:stockout_district") {
		if err := r.db.QueryRow(ctx, `SELECT `+users.DistrictOfUser, user.ID).Scan(&s.districtID); err != nil {
			return scope{}, err
		}
	}
	return s, nil
}

// Filter narrows a report. From and To bound the period in which notifications were raised.
type Filter struct {
	From, To     time.Time
	DistrictID   *string
	HotSpotID    *string
	Category     string // male or female, or empty for every notification
	DeadlineDays int
	Target       int // on-time target, percent
	Status       string
	Limit        int32
	Offset       int32
}

// notificationsCTE is every notification the user may see that matches the filter, with its
// delivery and acknowledgement facts and status. Parameters: $1 all, $2 store, $3 hotspot, $4 user,
// $5 district they work in, $6 district filter, $7 hotspot filter, $8 category filter.
const notificationsCTE = `WITH n AS (
	SELECT r.id, r.hot_spot_id, h.name AS hot_spot, h.district_id, d.name AS district, r.selection,
		r.repeat_count, r.created_at, r.last_reported_at, r.fulfilled_at, r.rejected_at, f.*, ` + orders.NotificationStatus + ` AS status
	FROM stockout_reports r
	JOIN hot_spots h ON h.id = r.hot_spot_id
	LEFT JOIN districts d ON d.id = h.district_id` + orders.NotificationFacts + `
	WHERE ($1::boolean OR r.district_store_id = $2::uuid OR r.hot_spot_id = $3::uuid OR r.reported_by_id = $4::uuid
			OR h.district_id = $5::uuid)
		AND ($6::uuid IS NULL OR h.district_id = $6) AND ($7::uuid IS NULL OR r.hot_spot_id = $7)
		AND ($8 = '' OR r.selection IN ($8, 'both')))`

func (s scope) args(f Filter) []any {
	return []any{s.all, s.storeID, s.hotSpotID, s.userID, s.districtID, f.DistrictID, f.HotSpotID, f.Category}
}

// NotificationSummary holds the notification measures for a period (reporting requirements, measures).
type NotificationSummary struct {
	Period                  Period           `json:"period"`
	DateBasis               string           `json:"date_basis"`
	DataUpdatedAt           time.Time        `json:"data_updated_at"`
	AcknowledgementsThrough time.Time        `json:"acknowledgements_through"`
	Category                *string          `json:"category"`
	Raised                  int64            `json:"notifications_raised"`
	BySelection             map[string]int64 `json:"by_selection"`
	Fulfilled               int64            `json:"notifications_fulfilled"`
	PartlyReceived          int64            `json:"partly_received"`
	AwaitingAcknowledgement int64            `json:"awaiting_acknowledgement"`
	AwaitingSupply          int64            `json:"awaiting_supply"`
	// Rejected requests are closed without stock: neither fulfilled nor pending.
	Rejected               int64                `json:"notifications_rejected"`
	FulfilmentRate         *float64             `json:"fulfilment_rate"`
	Component              *ComponentFulfilment `json:"component"`
	Response               ResponseDuration     `json:"response"`
	Deadline               DeadlineProgress     `json:"deadline"`
	Backlog                Backlog              `json:"backlog"`
	AcknowledgementOverdue int64                `json:"acknowledgement_overdue"`
	Districts              []DistrictRow        `json:"districts"`
	Receipts               ReceiptActivity      `json:"receipts"`
	// Settings are the review cycle, deadline and target in effect; request parameters may override them.
	Settings ResponseSettings `json:"settings"`
}

type Period struct {
	From string `json:"from"`
	To   string `json:"to"`
}

// ComponentFulfilment is the filtered type's part of each notification that includes it: a Both
// notification counts once here and once under the other type, so the two exceed unique notifications.
type ComponentFulfilment struct {
	Category      string   `json:"category"`
	Notifications int64    `json:"notifications"`
	Fulfilled     int64    `json:"fulfilled"`
	Rate          *float64 `json:"rate"`
}

type ResponseDuration struct {
	MedianHours        *float64 `json:"median_hours"`
	FulfilledIncluded  int64    `json:"fulfilled_included"`
	Pending            int64    `json:"pending"`
	OldestPendingHours *float64 `json:"oldest_pending_hours"`
}

type DeadlineProgress struct {
	Days          int      `json:"days"`
	TargetPercent int      `json:"target_percent"`
	OnTime        int64    `json:"fulfilled_on_time"`
	OnTimeRate    *float64 `json:"on_time_rate"`
	TargetMet     *bool    `json:"target_met"`
	LatePending   int64    `json:"late_pending"`
}

// Backlog is the open notifications raised before the period, kept apart from it.
type Backlog struct {
	Open           int64      `json:"open"`
	OldestRaisedAt *time.Time `json:"oldest_raised_at"`
}

type DistrictRow struct {
	DistrictID     *string  `json:"district_id"`
	District       *string  `json:"district"`
	Raised         int64    `json:"notifications_raised"`
	Fulfilled      int64    `json:"notifications_fulfilled"`
	FulfilmentRate *float64 `json:"fulfilment_rate"`
}

// ReceiptActivity is what hotspot managers acknowledged during the period, whenever the notification
// was raised: receipt activity, as opposed to the fulfilment of notifications raised in the period.
// With a category filter it counts that type's lines only.
type ReceiptActivity struct {
	DateBasis string `json:"date_basis"`
	// Acknowledged delivery lines, including those acknowledged with zero pieces.
	Acknowledgements int64 `json:"acknowledgements"`
	Notifications    int64 `json:"notifications"`
	// Of those notifications, the ones raised before the period.
	RaisedBeforePeriod int64 `json:"raised_before_period"`
	MalePieces         int64 `json:"male_pieces"`
	FemalePieces       int64 `json:"female_pieces"`
}

// rate is part of whole as a percentage to one decimal, or nil when whole is zero (Not applicable).
func rate(part, whole int64) *float64 {
	if whole == 0 {
		return nil
	}
	value := float64(int64(float64(part)*1000/float64(whole)+0.5)) / 10
	return &value
}

func (r *Repository) notificationSummary(ctx context.Context, s scope, f Filter, now time.Time) (NotificationSummary, error) {
	args := append(s.args(f), f.From, f.To, f.DeadlineDays)
	inPeriod := `created_at >= $9 AND created_at < $10`
	deadline := `make_interval(days => $11)`
	// Still waiting for the district: neither fulfilled nor rejected.
	open := `fulfilled_at IS NULL AND rejected_at IS NULL`
	out := NotificationSummary{
		Period:    Period{From: f.From.In(Kampala).Format(time.DateOnly), To: f.To.In(Kampala).AddDate(0, 0, -1).Format(time.DateOnly)},
		DateBasis: raisedBasis, DataUpdatedAt: now, AcknowledgementsThrough: now, BySelection: map[string]int64{},
		Districts: []DistrictRow{}, Receipts: ReceiptActivity{DateBasis: acknowledgedBasis},
		Deadline: DeadlineProgress{Days: f.DeadlineDays, TargetPercent: f.Target},
	}
	var male, female, both, componentFulfilled int64
	var component string
	if f.Category != "" {
		component = "acked_" + f.Category
	} else {
		component = "false"
	}
	err := r.db.QueryRow(ctx, notificationsCTE+`
		SELECT count(*) FILTER (WHERE `+inPeriod+`),
			count(*) FILTER (WHERE `+inPeriod+` AND selection = 'male'),
			count(*) FILTER (WHERE `+inPeriod+` AND selection = 'female'),
			count(*) FILTER (WHERE `+inPeriod+` AND selection = 'both'),
			count(*) FILTER (WHERE `+inPeriod+` AND status = 'fulfilled'),
			count(*) FILTER (WHERE `+inPeriod+` AND status = 'partly_received'),
			count(*) FILTER (WHERE `+inPeriod+` AND status = 'awaiting_acknowledgement'),
			count(*) FILTER (WHERE `+inPeriod+` AND status = 'awaiting_supply'),
			count(*) FILTER (WHERE `+inPeriod+` AND status = 'rejected'),
			count(*) FILTER (WHERE `+inPeriod+` AND `+component+`),
			percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM fulfilled_at - created_at) / 3600)
				FILTER (WHERE `+inPeriod+` AND fulfilled_at IS NOT NULL),
			extract(epoch FROM now() - min(created_at) FILTER (WHERE `+inPeriod+` AND `+open+`)) / 3600,
			count(*) FILTER (WHERE `+inPeriod+` AND fulfilled_at - created_at <= `+deadline+`),
			count(*) FILTER (WHERE `+inPeriod+` AND `+open+` AND now() - created_at > `+deadline+`),
			count(*) FILTER (WHERE created_at < $9 AND `+open+`),
			min(created_at) FILTER (WHERE created_at < $9 AND `+open+`),
			count(*) FILTER (WHERE `+inPeriod+` AND unacknowledged_lines > 0 AND now() - oldest_unacknowledged_at > `+deadline+`)
		FROM n`, args...).Scan(&out.Raised, &male, &female, &both, &out.Fulfilled, &out.PartlyReceived,
		&out.AwaitingAcknowledgement, &out.AwaitingSupply, &out.Rejected, &componentFulfilled, &out.Response.MedianHours,
		&out.Response.OldestPendingHours, &out.Deadline.OnTime, &out.Deadline.LatePending, &out.Backlog.Open,
		&out.Backlog.OldestRaisedAt, &out.AcknowledgementOverdue)
	if err != nil {
		return NotificationSummary{}, err
	}
	out.BySelection = map[string]int64{"male": male, "female": female, "both": both}
	out.FulfilmentRate = rate(out.Fulfilled, out.Raised)
	out.Response.FulfilledIncluded = out.Fulfilled
	out.Response.Pending = out.Raised - out.Fulfilled - out.Rejected
	out.Deadline.OnTimeRate = rate(out.Deadline.OnTime, out.Raised)
	if out.Deadline.OnTimeRate != nil {
		met := *out.Deadline.OnTimeRate >= float64(f.Target)
		out.Deadline.TargetMet = &met
	}
	if f.Category != "" {
		category := f.Category
		out.Category = &category
		out.Component = &ComponentFulfilment{Category: category, Notifications: out.Raised,
			Fulfilled: componentFulfilled, Rate: rate(componentFulfilled, out.Raised)}
	}
	rows, err := r.db.Query(ctx, notificationsCTE+`
		SELECT district_id, district, count(*), count(*) FILTER (WHERE status = 'fulfilled')
		FROM n WHERE `+inPeriod+` GROUP BY district_id, district ORDER BY district NULLS LAST`, args[:10]...)
	if err != nil {
		return NotificationSummary{}, err
	}
	out.Districts, err = pgx.CollectRows(rows, func(row pgx.CollectableRow) (DistrictRow, error) {
		var d DistrictRow
		err := row.Scan(&d.DistrictID, &d.District, &d.Raised, &d.Fulfilled)
		d.FulfilmentRate = rate(d.Fulfilled, d.Raised)
		return d, err
	})
	if err != nil {
		return NotificationSummary{}, err
	}
	err = r.db.QueryRow(ctx, notificationsCTE+`
		SELECT count(l.id), count(DISTINCT n.id), count(DISTINCT n.id) FILTER (WHERE n.created_at < $9),
			coalesce(sum(l.acknowledged_pieces) FILTER (WHERE l.category = 'male'), 0),
			coalesce(sum(l.acknowledged_pieces) FILTER (WHERE l.category = 'female'), 0)
		FROM n JOIN hotspot_deliveries hd ON hd.stockout_report_id = n.id
		JOIN hotspot_delivery_lines l ON l.delivery_id = hd.id
		WHERE l.acknowledged_at >= $9 AND l.acknowledged_at < $10 AND ($8 = '' OR l.category = $8)`,
		args[:10]...).Scan(&out.Receipts.Acknowledgements, &out.Receipts.Notifications,
		&out.Receipts.RaisedBeforePeriod, &out.Receipts.MalePieces, &out.Receipts.FemalePieces)
	if err != nil {
		return NotificationSummary{}, err
	}
	return out, nil
}

// NotificationRecord is one notification behind a report total (RF08), with what was delivered and
// acknowledged per type in pieces.
type NotificationRecord struct {
	ID                     string     `json:"id"`
	HotSpotID              string     `json:"hot_spot_id"`
	HotSpot                *string    `json:"hot_spot"`
	DistrictID             *string    `json:"district_id"`
	District               *string    `json:"district"`
	Selection              string     `json:"selection"`
	Status                 string     `json:"status"`
	RaisedAt               time.Time  `json:"raised_at"`
	LastReportedAt         time.Time  `json:"last_reported_at"`
	RepeatCount            int        `json:"repeat_count"`
	DeliveredMalePieces    int64      `json:"delivered_male_pieces"`
	DeliveredFemalePieces  int64      `json:"delivered_female_pieces"`
	ReceivedMalePieces     int64      `json:"received_male_pieces"`
	ReceivedFemalePieces   int64      `json:"received_female_pieces"`
	FulfilledAt            *time.Time `json:"fulfilled_at"`
	ResponseHours          *float64   `json:"response_hours"`
	AcknowledgementOverdue bool       `json:"acknowledgement_overdue"`
}

func (r *Repository) notificationRecords(ctx context.Context, s scope, f Filter) ([]NotificationRecord, error) {
	args := append(s.args(f), f.From, f.To, f.DeadlineDays, f.Status, f.Limit, f.Offset)
	rows, err := r.db.Query(ctx, notificationsCTE+`
		SELECT id, hot_spot_id, hot_spot, district_id, district, selection, status, created_at, last_reported_at,
			repeat_count, delivered_male, delivered_female, received_male, received_female, fulfilled_at,
			extract(epoch FROM fulfilled_at - created_at) / 3600,
			unacknowledged_lines > 0 AND now() - oldest_unacknowledged_at > make_interval(days => $11)
		FROM n WHERE created_at >= $9 AND created_at < $10 AND ($12 = '' OR status = $12)
		ORDER BY created_at DESC, id DESC LIMIT $13 OFFSET $14`, args...)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowToStructByPos[NotificationRecord])
}
