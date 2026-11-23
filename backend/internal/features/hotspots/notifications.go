package hotspots

import (
	"context"

	"clims-backend/internal/features/audit"
	"clims-backend/internal/features/notifications"

	"github.com/jackc/pgx/v5"
)

// NotificationTypes are the hotspot notifications; register them once at startup.
// Templates receive name, district and, where the step has one, comment.
func NotificationTypes() []notifications.Type {
	inApp := []string{notifications.ChannelInApp}
	// The submitter (a VHT in the field app) also gets the DCFP's decisions and comments as pushes.
	// DCFPs use the website, which registers no push device, so they keep receiving them in-app only.
	inAppAndPush := []string{notifications.ChannelInApp, notifications.ChannelPush}
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
		{Name: "hotspot.commented", Channels: inAppAndPush,
			Title: "New comment on {{.name}}",
			Body:  "{{.comment}}"},
		{Name: "hotspot.activated", Channels: inAppAndPush,
			Title: "Hotspot activated: {{.name}}",
			Body:  "{{.name}} in {{.district}} is now active. Comment: {{.comment}}"},
		{Name: "hotspot.deactivated", Channels: inAppAndPush,
			Title: "Hotspot deactivated: {{.name}}",
			Body:  "{{.name}} in {{.district}} was deactivated. Reason: {{.comment}}"},
		{Name: "hotspot.rejected", Channels: inAppAndPush,
			Title: "Hotspot rejected: {{.name}}",
			Body:  "{{.name}} in {{.district}} was rejected. Reason: {{.comment}} Edit the hotspot to resubmit it."},
	}
}

// record writes a workflow step to hot_spot_events, the hotspot's history, and
// notifies the people concerned. With notifyDistrict, the hotspot's district DCFPs
// (hotspots:activate) are notified; notifyUser adds one person, normally the submitter.
func (r *Repository) record(ctx context.Context, tx pgx.Tx, hotSpotID, actorID, action string,
	before map[string]any, notifyDistrict bool, notifyUser, comment *string) error {
	if err := r.recordAudit(ctx, tx, hotSpotID, action, before, comment); err != nil {
		return err
	}
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

// auditSnapshot is what a hotspot's audit entry compares: its details, review state and
// current contact person.
const auditSnapshot = `SELECT jsonb_build_object('name', h.name, 'type', h.type, 'village', h.village,
	'district_id', h.district_id, 'subcounty_id', h.subcounty_id, 'latitude', h.latitude, 'longitude', h.longitude,
	'has_condom_dispenser', h.has_condom_dispenser, 'dispenser_condition', h.dispenser_condition,
	'status', h.status, 'review_status', h.review_status,
	'contact_person_name', c.name, 'contact_person_phone', c.phone_number)
	FROM hot_spots h LEFT JOIN LATERAL (SELECT name, phone_number FROM contact_persons
		WHERE hot_spot_id = h.id ORDER BY created_at DESC, id DESC LIMIT 1) c ON true
	WHERE h.id = $1`

func snapshot(ctx context.Context, tx pgx.Tx, id string) (map[string]any, error) {
	var state map[string]any
	err := tx.QueryRow(ctx, auditSnapshot, id).Scan(&state)
	return state, err
}

// recordAudit writes the step to the audit log with what it changed. The comment is the
// reason a DCFP gave, or the text of a comment.
func (r *Repository) recordAudit(ctx context.Context, tx pgx.Tx, id, action string, before map[string]any, comment *string) error {
	after, err := snapshot(ctx, tx, id)
	if err != nil {
		return err
	}
	// A nil before (a submission) records every field as new.
	entry := audit.Entry{Action: "hotspot." + action, Target: &audit.Subject{Type: "hotspot", ID: id},
		Changes: audit.Diff(before, after)}
	for _, state := range []map[string]any{before, after} {
		if district, ok := state["district_id"].(string); ok {
			entry.Related = append(entry.Related, audit.Subject{Type: "district", ID: district})
		}
	}
	if comment != nil {
		entry.Details = map[string]any{"comment": *comment}
	}
	return r.audit.Record(ctx, tx, entry)
}
