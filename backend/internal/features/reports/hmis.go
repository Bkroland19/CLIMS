package reports

import (
	"context"
	"time"

	"clims-backend/internal/features/users"

	"github.com/jackc/pgx/v5"
)

// HMISRow is one area's acknowledged hotspot receipts for a month, in individual pieces, as 105-CT11
// (Female condoms) and 105-CT12 (Male condoms) would need them.
type HMISRow struct {
	DistrictID          *string `json:"district_id"`
	District            *string `json:"district"`
	SubcountyID         *string `json:"subcounty_id"`
	Subcounty           *string `json:"subcounty"`
	CT11FemalePieces    int64   `json:"ct11_female_pieces"`
	CT12MalePieces      int64   `json:"ct12_male_pieces"`
	Acknowledgements    int64   `json:"acknowledgements"`
	Hotspots            int64   `json:"hotspots"`
	UnacknowledgedLines int64   `json:"unacknowledged_lines"`
}

// HMISReadiness prepares HMIS 105 condom figures (RF14) without submitting them. Every interpretation
// the programme has not approved is listed as pending, and integration stays disabled.
type HMISReadiness struct {
	Month              string            `json:"month"`
	DataUpdatedAt      time.Time         `json:"data_updated_at"`
	DateBasis          string            `json:"date_basis"`
	Measure            string            `json:"measure"`
	DataElements       map[string]string `json:"data_elements"`
	PendingDecisions   []string          `json:"pending_decisions"`
	IntegrationEnabled bool              `json:"integration_enabled"`
	Total              HMISRow           `json:"total"`
	Rows               []HMISRow         `json:"rows"`
	FieldSync          FieldSync         `json:"field_sync"`
}

// hmisScope limits HMIS figures to every district for national users, or the district the user works in.
func (r *Repository) hmisDistrict(ctx context.Context, s scope) (*string, error) {
	if s.all {
		return nil, nil
	}
	var district *string
	err := r.db.QueryRow(ctx, `SELECT `+users.DistrictOfUser, s.userID).Scan(&district)
	return district, err
}

// hmisReadiness sums the pieces hotspot managers acknowledged in the month by the hotspot's district
// and subcounty. Lines delivered in the month but not acknowledged are a quality issue, not counted.
func (r *Repository) hmisReadiness(ctx context.Context, s scope, month time.Time, districtFilter *string, now time.Time) (HMISReadiness, error) {
	start := month
	end := month.AddDate(0, 1, 0)
	out := HMISReadiness{
		Month:         start.Format("2006-01"),
		DataUpdatedAt: now,
		DateBasis:     acknowledgedBasis,
		Measure:       "Acknowledged receipts at hotspots: operational evidence of supply, not condoms dispensed.",
		DataElements:  map[string]string{"105-CT11": "Female condoms (pieces)", "105-CT12": "Male condoms (pieces)"},
		PendingDecisions: []string{
			"Counting event: whether an acknowledged delivery counts as dispensing.",
			"Dispensing channel: which of the four 2.4.2 channels community hotspot supply belongs to.",
			"Subcounty reporting units: approval and DHIS2 metadata before any submission.",
		},
		Rows:      []HMISRow{},
		FieldSync: FieldSync{Note: fieldSyncNote},
	}
	var own *string
	own, err := r.hmisDistrict(ctx, s)
	if err != nil {
		return HMISReadiness{}, err
	}
	if !s.all && own == nil {
		return out, nil // a user with no district sees no district's figures
	}
	rows, err := r.db.Query(ctx, `WITH lines AS (
			SELECT h.district_id, h.subcounty_id, l.category, l.acknowledged_pieces, l.acknowledged_at,
				d.created_at AS delivered_at, h.id AS hot_spot_id
			FROM hotspot_delivery_lines l
			JOIN hotspot_deliveries d ON d.id = l.delivery_id
			JOIN stockout_reports r ON r.id = d.stockout_report_id
			JOIN hot_spots h ON h.id = r.hot_spot_id
			WHERE ($1::uuid IS NULL OR h.district_id = $1) AND ($2::uuid IS NULL OR h.district_id = $2)
				AND ((l.acknowledged_at >= $3 AND l.acknowledged_at < $4)
					OR (l.acknowledged_at IS NULL AND d.created_at >= $3 AND d.created_at < $4)))
		SELECT l.district_id, dist.name, l.subcounty_id, sc.name,
			coalesce(sum(l.acknowledged_pieces) FILTER (WHERE l.category = 'female' AND l.acknowledged_at IS NOT NULL), 0),
			coalesce(sum(l.acknowledged_pieces) FILTER (WHERE l.category = 'male' AND l.acknowledged_at IS NOT NULL), 0),
			count(*) FILTER (WHERE l.acknowledged_at IS NOT NULL AND l.acknowledged_pieces > 0),
			count(DISTINCT l.hot_spot_id) FILTER (WHERE l.acknowledged_at IS NOT NULL AND l.acknowledged_pieces > 0),
			count(*) FILTER (WHERE l.acknowledged_at IS NULL)
		FROM lines l
		LEFT JOIN districts dist ON dist.id = l.district_id
		LEFT JOIN subcounties sc ON sc.id = l.subcounty_id
		GROUP BY l.district_id, dist.name, l.subcounty_id, sc.name
		ORDER BY dist.name NULLS LAST, sc.name NULLS LAST`, own, districtFilter, start, end)
	if err != nil {
		return HMISReadiness{}, err
	}
	out.Rows, err = pgx.CollectRows(rows, pgx.RowToStructByPos[HMISRow])
	if err != nil {
		return HMISReadiness{}, err
	}
	for _, row := range out.Rows {
		out.Total.CT11FemalePieces += row.CT11FemalePieces
		out.Total.CT12MalePieces += row.CT12MalePieces
		out.Total.Acknowledgements += row.Acknowledgements
		out.Total.Hotspots += row.Hotspots
		out.Total.UnacknowledgedLines += row.UnacknowledgedLines
	}
	// The phones counted are those of the same districts as the figures.
	district := districtFilter
	if !s.all {
		if districtFilter != nil && *districtFilter != *own {
			return out, nil // another district: no figures, so no phones either
		}
		district = own
	}
	out.FieldSync, err = r.fieldSync(ctx, scope{all: true}, district, nil, hmisActions, start, end)
	return out, err
}
