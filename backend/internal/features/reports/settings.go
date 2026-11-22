package reports

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

var (
	errSettingsScope = errors.New("you can set response targets for your assigned store only; national targets need orders:all_stores")
	errPastEffective = errors.New("effective_from cannot be in the past: earlier reports keep the settings they used")
)

// ResponseSettings are the review cycle, receipt deadline and on-time target for notification reports
// (RF07). Source says where they came from: a store's own row, the national row, or the draft default.
type ResponseSettings struct {
	ID            *string    `json:"id"`
	StoreID       *string    `json:"store_id"`
	ReviewCycle   string     `json:"review_cycle"`
	DeadlineDays  int        `json:"deadline_days"`
	TargetPercent int        `json:"target_percent"`
	EffectiveFrom *string    `json:"effective_from"`
	SetByID       *string    `json:"set_by_id"`
	SetBy         *string    `json:"set_by"`
	Reason        *string    `json:"reason"`
	Source        string     `json:"source"`
	CreatedAt     *time.Time `json:"created_at"`
}

// DefaultSettings are the draft's proposed defaults, for demonstration until the programme approves them.
var DefaultSettings = ResponseSettings{ReviewCycle: "monthly", DeadlineDays: 7, TargetPercent: 80, Source: "default"}

const settingsColumns = `rs.id, rs.store_id, rs.review_cycle, rs.deadline_days, rs.target_percent,
	to_char(rs.effective_from, 'YYYY-MM-DD'), rs.set_by_id,
	nullif(btrim(concat_ws(' ', u.firstname, u.lastname)), ''), rs.reason,
	CASE WHEN rs.store_id IS NULL THEN 'national' ELSE 'store' END, rs.created_at`

func scanSettings(row pgx.Row) (ResponseSettings, error) {
	var s ResponseSettings
	err := row.Scan(&s.ID, &s.StoreID, &s.ReviewCycle, &s.DeadlineDays, &s.TargetPercent, &s.EffectiveFrom,
		&s.SetByID, &s.SetBy, &s.Reason, &s.Source, &s.CreatedAt)
	return s, err
}

// effectiveSettings are the settings in effect for a store on a date: its own latest row from on or
// before the date, else the national one, else the defaults. A nil store reads the national settings.
func (r *Repository) effectiveSettings(ctx context.Context, storeID *string, on time.Time) (ResponseSettings, error) {
	s, err := scanSettings(r.db.QueryRow(ctx, `SELECT `+settingsColumns+` FROM report_response_settings rs
		JOIN users u ON u.id = rs.set_by_id
		WHERE (rs.store_id = $1::uuid OR rs.store_id IS NULL) AND rs.effective_from <= $2
		ORDER BY rs.store_id IS NULL, rs.effective_from DESC, rs.created_at DESC LIMIT 1`, storeID, on))
	if errors.Is(err, pgx.ErrNoRows) {
		return DefaultSettings, nil
	}
	return s, err
}

// settingsHistory lists every row for one scope, newest first, including ones not yet in effect.
func (r *Repository) settingsHistory(ctx context.Context, storeID *string) ([]ResponseSettings, error) {
	rows, err := r.db.Query(ctx, `SELECT `+settingsColumns+` FROM report_response_settings rs
		JOIN users u ON u.id = rs.set_by_id
		WHERE rs.store_id IS NOT DISTINCT FROM $1::uuid
		ORDER BY rs.effective_from DESC, rs.created_at DESC LIMIT 100`, storeID)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (ResponseSettings, error) { return scanSettings(row) })
}

// SettingsInput is a new setting for a store, or nationally when StoreID is nil.
type SettingsInput struct {
	StoreID       *string `json:"store_id"`
	ReviewCycle   string  `json:"review_cycle"`
	DeadlineDays  int     `json:"deadline_days"`
	TargetPercent int     `json:"target_percent"`
	EffectiveFrom *string `json:"effective_from"`
	Reason        string  `json:"reason"`
}

func (r *Repository) saveSettings(ctx context.Context, in SettingsInput, effective time.Time, actorID string) (ResponseSettings, error) {
	var id string
	if err := r.db.QueryRow(ctx, `INSERT INTO report_response_settings
			(store_id, review_cycle, deadline_days, target_percent, effective_from, set_by_id, reason)
		VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`, in.StoreID, in.ReviewCycle, in.DeadlineDays,
		in.TargetPercent, effective, actorID, in.Reason).Scan(&id); err != nil {
		return ResponseSettings{}, err
	}
	return scanSettings(r.db.QueryRow(ctx, `SELECT `+settingsColumns+` FROM report_response_settings rs
		JOIN users u ON u.id = rs.set_by_id WHERE rs.id = $1`, id))
}

// districtStore is the district store whose settings apply to a district's reports.
func (r *Repository) districtStore(ctx context.Context, districtID string) (*string, error) {
	var id *string
	err := r.db.QueryRow(ctx, `SELECT id FROM stores WHERE store_type = 'district' AND district_id = $1`, districtID).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return id, err
}

// CycleStart is the first Kampala day of the review cycle containing today: the Monday of the week,
// the first of the month, of the two-month block (January, March, ...) or of the quarter.
func CycleStart(cycle string, today time.Time) time.Time {
	t := today.In(Kampala)
	day := time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, Kampala)
	switch cycle {
	case "weekly":
		return day.AddDate(0, 0, -((int(day.Weekday()) + 6) % 7))
	case "bimonthly":
		return time.Date(t.Year(), t.Month()-(t.Month()-1)%2, 1, 0, 0, 0, 0, Kampala)
	case "quarterly":
		return time.Date(t.Year(), t.Month()-(t.Month()-1)%3, 1, 0, 0, 0, 0, Kampala)
	}
	return time.Date(t.Year(), t.Month(), 1, 0, 0, 0, 0, Kampala)
}

// ValidCycle reports whether cycle is a review cycle the requirements list.
func ValidCycle(cycle string) bool {
	return cycle == "weekly" || cycle == "monthly" || cycle == "bimonthly" || cycle == "quarterly"
}
