package integration

import (
	"context"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

func testHotSpotWorkflow(t *testing.T, pool *pgxpool.Pool,
	request func(string, string, any, string, int) map[string]any,
	login func(string, string, int) string,
	admin string,
) {
	t.Helper()
	ctx := context.Background()
	scalar := func(dest any, sql string, args ...any) {
		t.Helper()
		if err := pool.QueryRow(ctx, sql, args...).Scan(dest); err != nil {
			t.Fatal(err)
		}
	}

	// The legacy backup converts into the new shape on a fresh install.
	var converted, archived, active, comments, assignedDCFPs int
	scalar(&converted, `SELECT count(*) FROM hot_spots`)
	scalar(&archived, `SELECT count(*) FROM legacy_hot_spots`)
	scalar(&active, `SELECT count(*) FROM hot_spots WHERE status = 'active'`)
	scalar(&comments, `SELECT count(*) FROM hot_spot_comments`)
	scalar(&assignedDCFPs, `SELECT count(*) FROM users u JOIN role_user ru ON ru.user_id = u.id
		JOIN roles r ON r.id = ru.role_id
		WHERE r.name = 'dfcp' AND u.store_id IS NOT NULL AND u.legacy_id IS NOT NULL`)
	if converted != 18221 || archived != 18221 || active != 17343 || comments != 7425 || assignedDCFPs != 57 {
		t.Fatalf("legacy conversion: hotspots=%d archived=%d active=%d comments=%d dcfps=%d",
			converted, archived, active, comments, assignedDCFPs)
	}
	var placeholders int
	scalar(&placeholders, `SELECT count(*) FROM districts WHERE uid IN ('jms', 'nms')`)
	if placeholders != 0 {
		t.Fatal("warehouse placeholders became districts")
	}

	// A district with a subcounty and store, and a second district for scope checks.
	var region, district, subcounty, store, otherSubcounty, otherStore string
	if err := pool.QueryRow(ctx, `SELECT d.region_id, d.id, s.id, st.id FROM districts d
		JOIN subcounties s ON s.district_id = d.id JOIN stores st ON st.district_id = d.id
		ORDER BY d.uid, s.uid LIMIT 1`).Scan(&region, &district, &subcounty, &store); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `SELECT s.id, st.id FROM districts d
		JOIN subcounties s ON s.district_id = d.id JOIN stores st ON st.district_id = d.id
		WHERE d.id <> $1 ORDER BY d.uid, s.uid LIMIT 1`, district).Scan(&otherSubcounty, &otherStore); err != nil {
		t.Fatal(err)
	}

	grant := func(role string, permissions ...string) {
		t.Helper()
		var roleID string
		scalar(&roleID, `SELECT id FROM roles WHERE name = $1`, role)
		request("PUT", "/roles/"+roleID+"/permissions", map[string]any{"permissions": permissions}, admin, 200)
	}
	grant("vht", "hotspots:read", "hotspots:submit")
	grant("dfcp", "hotspots:read", "hotspots:verify")
	account := func(role, name string, storeID *string) (string, string) {
		t.Helper()
		var roleID string
		scalar(&roleID, `SELECT id FROM roles WHERE name = $1`, role)
		email := name + "@example.test"
		id := request("POST", "/users", map[string]any{
			"username": name, "email": email, "password": "test-password-123", "role_ids": []string{roleID},
		}, admin, 201)["data"].(map[string]any)["user_id"].(string)
		if _, err := pool.Exec(ctx, `UPDATE users SET store_id = $2 WHERE id = $1`, id, storeID); err != nil {
			t.Fatal(err)
		}
		return id, login(email, "test-password-123", 200)
	}
	vhtID, vht := account("vht", "hotspot-vht", nil)
	_, otherVHT := account("vht", "hotspot-other-vht", nil)
	_, dcfp := account("dfcp", "hotspot-dcfp", &store)
	_, otherDCFP := account("dfcp", "hotspot-other-dcfp", &otherStore)

	submission := func(name string) map[string]any {
		return map[string]any{
			"name": name, "type": "Bar", "region_id": region, "district_id": district,
			"subcounty_id": subcounty, "village": "Test Village", "latitude": 0.3476, "longitude": 32.5825,
			"contact_person_name": "Jane Contact", "contact_person_phone": "+256 700 123 456",
			"has_condom_dispenser": true, "dispenser_condition": "Good",
		}
	}
	data := func(result map[string]any) map[string]any { return result["data"].(map[string]any) }
	hasEvent := func(token, hotSpotID, action string) bool {
		t.Helper()
		for _, event := range request("GET", "/hotspots/notifications", nil, token, 200)["data"].([]any) {
			e := event.(map[string]any)
			if e["hot_spot_id"] == hotSpotID && e["action"] == action {
				return true
			}
		}
		return false
	}
	listed := func(token, query, hotSpotID string) bool {
		t.Helper()
		for _, item := range data(request("GET", "/hotspots"+query, nil, token, 200))["hot_spots"].([]any) {
			if item.(map[string]any)["id"] == hotSpotID {
				return true
			}
		}
		return false
	}

	// Submission: inactive, note kept as a comment, submitter managing it.
	body := submission("Workflow Test Bar")
	body["note"] = "Busy on weekends"
	hotSpot := data(request("POST", "/hotspots", body, vht, 201))
	id := hotSpot["id"].(string)
	path := "/hotspots/" + id
	if hotSpot["status"] != "inactive" || hotSpot["entered_by_id"] != vhtID ||
		len(hotSpot["comments"].([]any)) != 1 || hotSpot["manager_ids"].([]any)[0] != vhtID {
		t.Fatalf("unexpected submission: %v", hotSpot)
	}
	if hotSpot["contact_person"].(map[string]any)["phone_number"] != "+256700123456" {
		t.Fatal("contact phone was not normalised")
	}
	request("POST", "/hotspots", submission("  workflow   TEST bar "), vht, 409)
	misplaced := submission("Elsewhere Bar")
	misplaced["subcounty_id"] = otherSubcounty
	request("POST", "/hotspots", misplaced, vht, 422)
	incomplete := submission("Incomplete Bar")
	delete(incomplete, "latitude")
	request("POST", "/hotspots", incomplete, vht, 422)
	request("POST", "/hotspots", submission("Not Allowed Bar"), dcfp, 403)

	// Visibility: the submitter and their district's DCFP only.
	if !hasEvent(dcfp, id, "submitted") || hasEvent(otherDCFP, id, "submitted") {
		t.Fatal("submission notification reached the wrong district")
	}
	if !listed(dcfp, "?status=inactive", id) || listed(dcfp, "?status=active", id) || listed(otherVHT, "", id) {
		t.Fatal("hotspot list scope or status filter is wrong")
	}
	request("GET", path, nil, otherVHT, 404)
	request("GET", path, nil, otherDCFP, 404)
	request("GET", "/hotspots?status=pending", nil, dcfp, 400)

	// The DCFP flags an issue; the hotspot stays inactive and the VHT fixes it.
	reviewed := data(request("POST", path+"/comments", map[string]any{"comment": "GPS looks off"}, dcfp, 201))
	if reviewed["status"] != "inactive" || !hasEvent(vht, id, "commented") {
		t.Fatal("DCFP comment changed status or did not notify the VHT")
	}
	fixed := submission("Workflow Test Bar")
	fixed["latitude"], fixed["contact_person_phone"] = 0.35, "0700999888"
	request("PUT", path, fixed, otherVHT, 404)
	request("PUT", path, fixed, dcfp, 403)
	updated := data(request("PUT", path, fixed, vht, 200))
	if updated["latitude"] != 0.35 || updated["contact_person"].(map[string]any)["phone_number"] != "0700999888" {
		t.Fatalf("edit not applied: %v", updated)
	}
	if !hasEvent(dcfp, id, "updated") {
		t.Fatal("edit did not notify the district")
	}

	// Activation needs the district's DCFP and a comment.
	reason := map[string]any{"comment": "Verified on site"}
	request("POST", path+"/activate", reason, vht, 403)
	request("POST", path+"/activate", map[string]any{"comment": "  "}, dcfp, 422)
	request("POST", path+"/activate", reason, otherDCFP, 404)
	activated := data(request("POST", path+"/activate", reason, dcfp, 200))
	if activated["status"] != "active" || !hasEvent(vht, id, "activated") {
		t.Fatal("activation did not apply or notify the VHT")
	}
	request("POST", path+"/activate", reason, dcfp, 409)
	request("PUT", path, fixed, vht, 409)

	// Deactivation and reactivation, each with its own comment.
	request("POST", path+"/deactivate", map[string]any{"comment": "Venue closed"}, dcfp, 200)
	if !hasEvent(vht, id, "deactivated") {
		t.Fatal("deactivation did not notify the VHT")
	}
	request("POST", path+"/deactivate", map[string]any{"comment": "Again"}, dcfp, 409)
	final := data(request("POST", path+"/activate", map[string]any{"comment": "Reopened"}, dcfp, 200))
	actions := []string{}
	for _, comment := range final["comments"].([]any) {
		actions = append(actions, comment.(map[string]any)["action"].(string))
	}
	if final["status"] != "active" || len(actions) != 5 || actions[4] != "activated" || actions[3] != "deactivated" {
		t.Fatalf("comment thread: %v", actions)
	}
	history := []string{}
	for _, event := range request("GET", path+"/events", nil, vht, 200)["data"].([]any) {
		history = append(history, event.(map[string]any)["action"].(string))
	}
	want := []string{"submitted", "commented", "updated", "activated", "deactivated", "activated"}
	if len(history) != len(want) {
		t.Fatalf("history: %v", history)
	}
	for i := range want {
		if history[i] != want[i] {
			t.Fatalf("history: %v", history)
		}
	}
	request("GET", path+"/events", nil, otherVHT, 404)

	// Lists put the most recently updated hotspot first; a comment counts.
	second := data(request("POST", "/hotspots", submission("Second Test Lodge"), vht, 201))["id"].(string)
	request("POST", path+"/comments", map[string]any{"comment": "Restocked"}, vht, 201)
	first := data(request("GET", "/hotspots?limit=2", nil, vht, 200))["hot_spots"].([]any)
	if len(first) != 2 || first[0].(map[string]any)["id"] != id || first[1].(map[string]any)["id"] != second {
		t.Fatalf("list order: %v", first)
	}
	if !hasEvent(dcfp, id, "commented") {
		t.Fatal("submitter comment did not notify the district")
	}
}
