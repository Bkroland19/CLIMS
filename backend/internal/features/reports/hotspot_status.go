package reports

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
)

// Hotspot report statuses (reporting requirements, "Hotspot status"): approved and active, waiting for
// the district's review, inactive (deactivated, or switched off), and rejected. Duplicates are rejected
// like any other submission; no separate duplicate status is recorded.
const (
	HotspotActive        = "active"
	HotspotPendingReview = "pending_review"
	HotspotInactive      = "inactive"
	HotspotRejected      = "rejected"
)

// ValidHotspotStatus reports whether s is a hotspot report status, or empty for every status.
func ValidHotspotStatus(s string) bool {
	switch s {
	case "", HotspotActive, HotspotPendingReview, HotspotInactive, HotspotRejected:
		return true
	}
	return false
}

const hotspotStatusBasis = "Status on the data update date. Each hotspot's effective date is when its current status was " +
	"set; decisions are counted by when they were made, in Africa/Kampala."

// hotspotNotRecorded are measures the draft asks for that no record holds yet.
var hotspotNotRecorded = []string{
	"Last field check: nothing records a field visit, and the recheck rules await district and field approval.",
	"Duplicate status: duplicates are rejected like any other submission, so they are counted as rejected.",
}

// statusEvents are the hotspot events that set its status: the VHT's submission and the district's decisions.
const statusEvents = `('submitted', 'resubmitted', 'activated', 'rejected', 'deactivated')`

// statusHotspotsCTE is every hotspot the user may report on that matches the district filter: every hotspot
// for national users, otherwise those of the district they work in, their own hotspot and those they
// submitted. Parameters: $1 all, $2 store, $3 hotspot, $4 user, $5 district they work in, $6 district filter.
const statusHotspotsCTE = `WITH reader AS (SELECT coalesce($5::uuid, (SELECT district_id FROM stores
		WHERE id = $2::uuid AND store_type = 'district')) AS district_id),
	hs AS (
	SELECT h.id, h.name, h.village, h.district_id, d.name AS district, h.subcounty_id, sc.name AS subcounty,
		CASE WHEN h.review_status = 'submitted' THEN 'pending_review'
			WHEN h.review_status = 'rejected' THEN 'rejected'
			WHEN h.review_status = 'active' AND h.status = 'active' THEN 'active'
			ELSE 'inactive' END AS status,
		h.review_status, e.action AS effective_event, coalesce(e.created_at, h.created_at) AS effective_at,
		cp.id IS NOT NULL AS has_contact,
		(SELECT count(*) FROM users mu WHERE mu.hot_spot_id = h.id AND mu.status = 'active') AS manager_accounts,
		nullif(btrim(concat_ws(' ', su.firstname, su.lastname)), '') AS submitted_by, h.created_at
	FROM hot_spots h CROSS JOIN reader
	LEFT JOIN districts d ON d.id = h.district_id
	LEFT JOIN subcounties sc ON sc.id = h.subcounty_id
	LEFT JOIN users su ON su.id = h.submitted_by_id
	LEFT JOIN LATERAL (SELECT action, created_at FROM hot_spot_events
		WHERE hot_spot_id = h.id AND action IN ` + statusEvents + `
		ORDER BY created_at DESC, id DESC LIMIT 1) e ON true
	LEFT JOIN LATERAL (SELECT id FROM contact_persons WHERE hot_spot_id = h.id LIMIT 1) cp ON true
	WHERE ($1::boolean OR h.district_id = reader.district_id OR h.id = $3::uuid OR h.submitted_by_id = $4::uuid)
		AND ($6::uuid IS NULL OR h.district_id = $6))`

func (s scope) hotspotStatusArgs(district *string) []any {
	return []any{s.all, s.storeID, s.hotSpotID, s.userID, s.districtID, district}
}

// HotspotStatusCounts are the hotspots in each report status. Contact-only hotspots have a contact person
// and no active account for the hotspot yet, whatever their status.
type HotspotStatusCounts struct {
	Total         int64 `json:"total"`
	Active        int64 `json:"active"`
	PendingReview int64 `json:"pending_review"`
	Inactive      int64 `json:"inactive"`
	Rejected      int64 `json:"rejected"`
	ContactOnly   int64 `json:"contact_only"`
}

type HotspotStatusDistrict struct {
	DistrictID *string `json:"district_id"`
	District   *string `json:"district"`
	HotspotStatusCounts
}

// HotspotStatusDecisions counts the submissions and district decisions made in the period, from the
// hotspots' history.
type HotspotStatusDecisions struct {
	Submitted   int64 `json:"submitted"`
	Resubmitted int64 `json:"resubmitted"`
	Activated   int64 `json:"activated"`
	Rejected    int64 `json:"rejected"`
	Deactivated int64 `json:"deactivated"`
}

// HotspotStatusReport is the current status of hotspots by district (RF13), with the decisions of the period.
type HotspotStatusReport struct {
	StatusDate  time.Time               `json:"status_date"`
	Period      Period                  `json:"period"`
	DateBasis   string                  `json:"date_basis"`
	Total       HotspotStatusCounts     `json:"total"`
	Districts   []HotspotStatusDistrict `json:"districts"`
	Decisions   HotspotStatusDecisions  `json:"decisions"`
	NotRecorded []string                `json:"not_recorded"`
	FieldSync   FieldSync               `json:"field_sync"`
}

const statusCountColumns = `count(*), count(*) FILTER (WHERE status = 'active'), count(*) FILTER (WHERE status = 'pending_review'),
	count(*) FILTER (WHERE status = 'inactive'), count(*) FILTER (WHERE status = 'rejected'),
	count(*) FILTER (WHERE has_contact AND manager_accounts = 0)`

func (r *Repository) hotspotStatusReport(ctx context.Context, s scope, f Filter, now time.Time) (HotspotStatusReport, error) {
	out := HotspotStatusReport{StatusDate: now, Period: periodOf(f), DateBasis: hotspotStatusBasis,
		Districts: []HotspotStatusDistrict{}, NotRecorded: hotspotNotRecorded}
	args := s.hotspotStatusArgs(f.DistrictID)
	t := &out.Total
	if err := r.db.QueryRow(ctx, statusHotspotsCTE+` SELECT `+statusCountColumns+` FROM hs`, args...).Scan(&t.Total, &t.Active,
		&t.PendingReview, &t.Inactive, &t.Rejected, &t.ContactOnly); err != nil {
		return HotspotStatusReport{}, err
	}
	rows, err := r.db.Query(ctx, statusHotspotsCTE+` SELECT district_id, district, `+statusCountColumns+`
		FROM hs GROUP BY district_id, district ORDER BY district NULLS LAST`, args...)
	if err != nil {
		return HotspotStatusReport{}, err
	}
	out.Districts, err = pgx.CollectRows(rows, func(row pgx.CollectableRow) (HotspotStatusDistrict, error) {
		var d HotspotStatusDistrict
		c := &d.HotspotStatusCounts
		err := row.Scan(&d.DistrictID, &d.District, &c.Total, &c.Active, &c.PendingReview, &c.Inactive, &c.Rejected, &c.ContactOnly)
		return d, err
	})
	if err != nil {
		return HotspotStatusReport{}, err
	}
	d := &out.Decisions
	if err = r.db.QueryRow(ctx, statusHotspotsCTE+`
		SELECT count(*) FILTER (WHERE ev.action = 'submitted'), count(*) FILTER (WHERE ev.action = 'resubmitted'),
			count(*) FILTER (WHERE ev.action = 'activated'), count(*) FILTER (WHERE ev.action = 'rejected'),
			count(*) FILTER (WHERE ev.action = 'deactivated')
		FROM hs JOIN hot_spot_events ev ON ev.hot_spot_id = hs.id
		WHERE ev.action IN `+statusEvents+` AND ev.created_at >= $7 AND ev.created_at < $8`,
		append(args, f.From, f.To)...).Scan(&d.Submitted, &d.Resubmitted, &d.Activated, &d.Rejected, &d.Deactivated); err != nil {
		return HotspotStatusReport{}, err
	}
	out.FieldSync, err = r.fieldSync(ctx, s, f.DistrictID, nil, hotspotActions, f.From, f.To)
	return out, err
}

// HotspotStatusRecord is one hotspot behind the report's counts. Coordinates and contact details are left
// out: the map serves locations under its own access rules.
type HotspotStatusRecord struct {
	ID              string    `json:"id"`
	Name            *string   `json:"name"`
	Village         *string   `json:"village"`
	DistrictID      *string   `json:"district_id"`
	District        *string   `json:"district"`
	SubcountyID     *string   `json:"subcounty_id"`
	Subcounty       *string   `json:"subcounty"`
	Status          string    `json:"status"`
	ReviewStatus    *string   `json:"review_status"`
	EffectiveEvent  *string   `json:"effective_event"`
	EffectiveAt     time.Time `json:"effective_at"`
	ContactOnly     bool      `json:"contact_only"`
	ManagerAccounts int64     `json:"manager_accounts"`
	SubmittedBy     *string   `json:"submitted_by"`
	CreatedAt       time.Time `json:"created_at"`
}

func (r *Repository) hotspotStatusRecords(ctx context.Context, s scope, f Filter) ([]HotspotStatusRecord, error) {
	rows, err := r.db.Query(ctx, statusHotspotsCTE+`
		SELECT id, name, village, district_id, district, subcounty_id, subcounty, status, review_status, effective_event,
			effective_at, has_contact AND manager_accounts = 0, manager_accounts, submitted_by, created_at
		FROM hs WHERE ($7 = '' OR status = $7)
		ORDER BY district NULLS LAST, name NULLS LAST, id LIMIT $8 OFFSET $9`,
		append(s.hotspotStatusArgs(f.DistrictID), f.Status, f.Limit, f.Offset)...)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowToStructByPos[HotspotStatusRecord])
}
