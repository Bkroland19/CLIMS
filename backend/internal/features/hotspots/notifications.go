package hotspots

import (
	"context"

	"clims-backend/internal/features/notifications"

	"github.com/jackc/pgx/v5"
)

// NotificationTypes are the hotspot notifications; register them once at startup.
// Templates receive name, district and, where the step has one, comment.
func NotificationTypes() []notifications.Type {
	inApp := []string{notifications.ChannelInApp}
	return []notifications.Type{
		{Name: "hotspot.submitted", Channels: inApp,
			Title: "New hotspot to verify: {{.name}}",
			Body:  "{{.name}} in {{.district}} was submitted and is waiting for verification."},
		{Name: "hotspot.updated", Channels: inApp,
			Title: "Hotspot updated: {{.name}}",
			Body:  "The submitter updated the details of {{.name}} in {{.district}}."},
		{Name: "hotspot.resubmitted", Channels: inApp,
			Title: "Hotspot resubmitted: {{.name}}",
			Body:  "{{.name}} in {{.district}} was corrected after rejection and is waiting for verification."},
		{Name: "hotspot.commented", Channels: inApp,
			Title: "New comment on {{.name}}",
			Body:  "{{.comment}}"},
		{Name: "hotspot.activated", Channels: inApp,
			Title: "Hotspot activated: {{.name}}",
			Body:  "{{.name}} in {{.district}} is now active. Comment: {{.comment}}"},
		{Name: "hotspot.deactivated", Channels: inApp,
			Title: "Hotspot deactivated: {{.name}}",
			Body:  "{{.name}} in {{.district}} was deactivated. Reason: {{.comment}}"},
		{Name: "hotspot.rejected", Channels: inApp,
			Title: "Hotspot rejected: {{.name}}",
			Body:  "{{.name}} in {{.district}} was rejected. Reason: {{.comment}} Edit the hotspot to resubmit it."},
	}
}

// record writes a workflow step to hot_spot_events, the hotspot's history, and
// notifies the people concerned. With notifyDistrict, the hotspot's district DCFPs
// (hotspots:activate) are notified; notifyUser adds one person, normally the submitter.
func (r *Repository) record(ctx context.Context, tx pgx.Tx, hotSpotID, actorID, action string,
	notifyDistrict bool, notifyUser, comment *string) error {
	var eventID, name, district string
	var districtID *string
	// The notify columns keep the deprecated /hotspots/notifications inbox working
	// until clients use the central one.
	if err := tx.QueryRow(ctx, `WITH event AS (
			INSERT INTO hot_spot_events (hot_spot_id, actor_id, action, status, notify_district_id, notify_user_id)
			SELECT h.id, $2, $3, h.review_status, CASE WHEN $4 THEN h.district_id END, $5
			FROM hot_spots h WHERE h.id = $1
			RETURNING id
		)
		SELECT event.id, coalesce(h.name, 'An unnamed hotspot'), coalesce(d.name, 'an unknown district'), h.district_id
		FROM event, hot_spots h LEFT JOIN districts d ON d.id = h.district_id
		WHERE h.id = $1`, hotSpotID, actorID, action, notifyDistrict, notifyUser).
		Scan(&eventID, &name, &district, &districtID); err != nil {
		return err
	}

	var targets []notifications.Target
	// A legacy hotspot without a district has no district DCFPs to notify.
	if notifyDistrict && districtID != nil {
		targets = append(targets, notifications.Target{Permission: "hotspots:activate", DistrictID: *districtID})
	}
	if notifyUser != nil {
		targets = append(targets, notifications.Target{UserIDs: []string{*notifyUser}})
	}
	if len(targets) == 0 {
		return nil
	}
	data := map[string]any{"name": name, "district": district}
	if comment != nil {
		data["comment"] = *comment
	}
	return r.notifier.Notify(ctx, tx, notifications.Message{
		Type:           "hotspot." + action,
		Targets:        targets,
		ActorID:        &actorID,
		Resource:       &notifications.Resource{Type: "hotspot", ID: hotSpotID},
		Data:           data,
		IdempotencyKey: eventID,
	})
}
