package reports

import (
	"context"
	"time"
)

// FieldSync is what field phones in the report's area have said about sending their saved actions
// (RN06, docs/modules/sync-log.md): work that may still change the totals, work the server refused,
// and work recorded only on the phone because the API has no endpoint for it yet. It holds counts
// only, so reading it needs no sync_logs:read.
type FieldSync struct {
	Note string `json:"note"`
	// Pending entries for this report's actions, waiting or retrying now, whenever they were saved.
	Pending               int64      `json:"pending"`
	OldestPendingQueuedAt *time.Time `json:"oldest_pending_queued_at"`
	// Entries for this report's actions saved in the period and refused by the server.
	Refused int64 `json:"refused"`
	// Entries saved in the period that only the phone holds: the API has no endpoint for them.
	PhoneOnly int64 `json:"phone_only"`
	// When a phone in the area last uploaded its log.
	LastReceivedAt *time.Time `json:"last_received_at"`
}

const fieldSyncNote = "Counts what field phones in this area have reported about sending their saved actions. " +
	"The server dates each action when it arrives, so a pending action counts in the period it arrives in; " +
	"a pending acknowledgement can still complete a notification raised earlier. " +
	"A phone that has not uploaded its log is not counted, and saved times come from the phone's clock."

// Phone actions that feed each report, and the actions the API has no endpoint for yet.
var (
	notificationActions = []string{"stockout", "acknowledge"}
	hmisActions         = []string{"acknowledge"}
	phoneOnlyActions    = []string{"notify", "confirmReceipt", "pickup", "deliver"}
)

// fieldSync counts the sync log entries of the phone users in the reader's area: everyone for
// national users, otherwise the district they work in, their hotspot and themselves. A user's
// district is that of their district store, else their subcounty, else their hotspot. district
// narrows it further; a hotspot filter narrows to the hotspot's district, since an entry names its
// hotspot only once it reaches the server.
func (r *Repository) fieldSync(ctx context.Context, s scope, district, hotSpot *string, actions []string, from, to time.Time) (FieldSync, error) {
	out := FieldSync{Note: fieldSyncNote}
	var user *string // none for a scope built for a district rather than a reader
	if s.userID != "" {
		user = &s.userID
	}
	err := r.db.QueryRow(ctx, `WITH phones AS (
			SELECT u.id, coalesce(st.district_id, sc.district_id, h.district_id) AS district_id, u.hot_spot_id
			FROM users u
			LEFT JOIN stores st ON st.id = u.store_id AND st.store_type = 'district'
			LEFT JOIN subcounties sc ON sc.id = u.subcounty_id
			LEFT JOIN hot_spots h ON h.id = u.hot_spot_id),
		reader AS (SELECT coalesce($5::uuid, (SELECT district_id FROM stores
			WHERE id = $2::uuid AND store_type = 'district')) AS district_id),
		filter AS (SELECT coalesce($6::uuid, (SELECT district_id FROM hot_spots WHERE id = $7::uuid)) AS district_id)
		SELECT count(*) FILTER (WHERE l.status IN ('waiting', 'retrying') AND l.action = ANY($8)),
			min(l.queued_at) FILTER (WHERE l.status IN ('waiting', 'retrying') AND l.action = ANY($8)),
			count(*) FILTER (WHERE l.status = 'refused' AND l.action = ANY($8)
				AND l.queued_at >= $9 AND l.queued_at < $10),
			count(*) FILTER (WHERE (l.status = 'saved_on_phone' OR l.action = ANY($11))
				AND l.queued_at >= $9 AND l.queued_at < $10),
			max(l.received_at)
		FROM mobile_sync_log l JOIN phones p ON p.id = l.user_id, reader, filter
		WHERE ($1::boolean OR p.district_id = reader.district_id OR p.hot_spot_id = $3::uuid OR p.id = $4::uuid)
			AND (filter.district_id IS NULL OR p.district_id = filter.district_id)
			AND ($7::uuid IS NULL OR filter.district_id IS NOT NULL)`,
		s.all, s.storeID, s.hotSpotID, user, s.districtID, district, hotSpot, actions, from, to, phoneOnlyActions,
	).Scan(&out.Pending, &out.OldestPendingQueuedAt, &out.Refused, &out.PhoneOnly, &out.LastReceivedAt)
	return out, err
}
