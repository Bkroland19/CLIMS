package integration

import (
	"context"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

// testHotSpotActivation checks the legacy conversion, then walks the workflow:
// a VHT submits, the district DCFP is notified, comments on issues, and
// activates or deactivates the hotspot with a comment. otherStore belongs to a
// different district and scopes the outsider DCFP.
func testHotSpotActivation(t *testing.T, pool *pgxpool.Pool,
	request func(string, string, any, string, int) map[string]any,
	login func(string, string, int) string,
	admin, otherStore string,
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
	var converted, archived, active, deactivated, comments, assignedDCFPs, placeholders int
	scalar(&converted, `SELECT count(*) FROM hot_spots`)
	scalar(&archived, `SELECT count(*) FROM legacy_hot_spots`)
	scalar(&active, `SELECT count(*) FROM hot_spots WHERE status = 'active' AND review_status = 'active'`)
	scalar(&deactivated, `SELECT count(*) FROM hot_spots WHERE status = 'inactive' AND review_status = 'deactivated'`)
	scalar(&comments, `SELECT count(*) FROM hot_spot_comments`)
	scalar(&assignedDCFPs, `SELECT count(*) FROM users u JOIN role_user ru ON ru.user_id = u.id
		JOIN roles r ON r.id = ru.role_id
		WHERE r.name = 'dfcp' AND u.store_id IS NOT NULL AND u.legacy_id IS NOT NULL`)
	scalar(&placeholders, `SELECT count(*) FROM districts WHERE uid IN ('jms', 'nms')`)
	if converted != 18221 || archived != 18221 || active != 17343 || deactivated != 878 ||
		comments != 7425 || assignedDCFPs != 57 || placeholders != 0 {
		t.Fatalf("legacy conversion: hotspots=%d archived=%d active=%d deactivated=%d comments=%d dcfps=%d placeholders=%d",
			converted, archived, active, deactivated, comments, assignedDCFPs, placeholders)
	}

	var region, district, subcounty, store, otherSubcounty string
	if err := pool.QueryRow(ctx, `SELECT d.region_id, d.id, s.id, st.id FROM districts d
		JOIN subcounties s ON s.district_id = d.id JOIN stores st ON st.district_id = d.id
		ORDER BY d.uid, s.uid LIMIT 1`).Scan(&region, &district, &subcounty, &store); err != nil {
		t.Fatal(err)
	}
	var otherRegion, otherDistrict string
	if err := pool.QueryRow(ctx, `SELECT d.region_id, d.id, s.id FROM subcounties s JOIN districts d ON d.id = s.district_id
		WHERE d.id <> $1 ORDER BY s.uid LIMIT 1`, district).Scan(&otherRegion, &otherDistrict, &otherSubcounty); err != nil {
		t.Fatal(err)
	}

	roleID := func(role string) string {
		t.Helper()
		var id string
		scalar(&id, `SELECT id FROM roles WHERE name = $1`, role)
		return id
	}
	grant := func(role string, permissions ...string) {
		t.Helper()
		request("PUT", "/roles/"+roleID(role)+"/permissions", map[string]any{"permissions": permissions}, admin, 200)
	}
	grant("vht", "hotspots:read", "hotspots:submit")
	grant("dfcp", "hotspots:read", "hotspots:activate")
	grant("store incharge", "hotspots:read")
	account := func(role, name string, storeID *string) (string, string) {
		t.Helper()
		email := name + "@example.test"
		id := request("POST", "/users", map[string]any{
			"username": name, "email": email, "password": "test-password-123", "role_ids": []string{roleID(role)},
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
	// Read access with a store assignment alone must not reveal the district.
	_, storekeeper := account("store incharge", "hotspot-storekeeper", &store)

	submission := func(name string) map[string]any {
		return map[string]any{
			"name": name, "type": "Bar", "region_id": region, "district_id": district,
			"subcounty_id": subcounty, "latitude": 0.3476, "longitude": 32.5825,
			"contact_person_name": "Jane Contact", "contact_person_phone": "+256 700 123 456",
			"has_condom_dispenser": true, "dispenser_condition": "Good",
		}
	}
	data := func(result map[string]any) map[string]any { return result["data"].(map[string]any) }
	listed := func(token, query, id string) bool {
		t.Helper()
		for _, item := range request("GET", "/hotspots"+query, nil, token, 200)["data"].([]any) {
			if item.(map[string]any)["id"] == id {
				return true
			}
		}
		return false
	}
	notified := func(token, id, action string) bool {
		t.Helper()
		for _, event := range request("GET", "/hotspots/notifications", nil, token, 200)["data"].([]any) {
			e := event.(map[string]any)
			if e["hot_spot_id"] == id && e["action"] == action {
				return true
			}
		}
		return false
	}
	state := func(h map[string]any, status, review string) {
		t.Helper()
		if h["status"] != status || h["review_status"] != review {
			t.Fatalf("expected %s/%s, got %v/%v", status, review, h["status"], h["review_status"])
		}
	}

	// Submission: inactive and submitted, comment kept, village optional.
	body := submission("Workflow Test Bar")
	body["comment"] = "Busy on weekends"
	hotSpot := data(request("POST", "/hotspots", body, vht, 201))
	id := hotSpot["id"].(string)
	path := "/hotspots/" + id
	state(hotSpot, "inactive", "submitted")
	if hotSpot["submitted_by_id"] != vhtID || hotSpot["village"] != nil || len(hotSpot["comments"].([]any)) != 1 ||
		hotSpot["contact_person"].(map[string]any)["phone_number"] != "+256700123456" {
		t.Fatalf("unexpected submission: %v", hotSpot)
	}
	request("POST", "/hotspots", submission("  workflow   TEST bar "), vht, 409)
	inVillage := submission("Workflow Test Bar")
	inVillage["village"] = "Kabaale"
	request("POST", "/hotspots", inVillage, vht, 201) // Same name, different village.
	misplaced := submission("Elsewhere Bar")
	misplaced["subcounty_id"] = otherSubcounty
	request("POST", "/hotspots", misplaced, vht, 422)
	incomplete := submission("Incomplete Bar")
	delete(incomplete, "contact_person_phone")
	request("POST", "/hotspots", incomplete, vht, 422)
	request("POST", "/hotspots", submission("Not Allowed Bar"), dcfp, 403)

	// Visibility: the submitter and their district's DCFP only.
	if !notified(dcfp, id, "submitted") || notified(otherDCFP, id, "submitted") {
		t.Fatal("submission notification reached the wrong district")
	}
	if !listed(dcfp, "?status=inactive", id) || listed(dcfp, "?status=active", id) ||
		listed(otherVHT, "", id) || listed(storekeeper, "", id) {
		t.Fatal("hotspot list scope or status filter is wrong")
	}
	request("GET", path, nil, otherVHT, 404)
	request("GET", path, nil, otherDCFP, 404)
	request("GET", path, nil, storekeeper, 404)
	request("GET", "/hotspots?status=submitted", nil, dcfp, 400)

	// The DCFP flags an issue; the hotspot stays submitted and the VHT fixes it.
	state(data(request("POST", path+"/comments", map[string]any{"comment": "GPS looks off"}, dcfp, 201)),
		"inactive", "submitted")
	if !notified(vht, id, "commented") {
		t.Fatal("DCFP comment did not notify the VHT")
	}
	fixed := submission("Workflow Test Bar")
	fixed["latitude"], fixed["contact_person_phone"] = 0.35, "0700999888"
	request("PUT", path, fixed, otherVHT, 404)
	request("PUT", path, fixed, dcfp, 403)
	updated := data(request("PUT", path, fixed, vht, 200))
	if updated["latitude"] != 0.35 || updated["contact_person"].(map[string]any)["phone_number"] != "0700999888" {
		t.Fatalf("edit not applied: %v", updated)
	}
	if !notified(dcfp, id, "updated") {
		t.Fatal("edit did not notify the district")
	}

	// Activation needs the district's DCFP and a comment.
	reason := map[string]any{"comment": "Verified on site"}
	request("POST", path+"/activate", reason, vht, 403)
	request("POST", path+"/activate", map[string]any{"comment": "  "}, dcfp, 422)
	request("POST", path+"/activate", reason, otherDCFP, 404)
	request("POST", path+"/deactivate", reason, dcfp, 409)
	state(data(request("POST", path+"/activate", reason, dcfp, 200)), "active", "active")
	if !notified(vht, id, "activated") {
		t.Fatal("activation did not notify the VHT")
	}
	request("POST", path+"/activate", reason, dcfp, 409)
	request("PUT", path, fixed, vht, 409)

	// Deactivation and reactivation, each with its own comment.
	state(data(request("POST", path+"/deactivate", map[string]any{"comment": "Venue closed"}, dcfp, 200)),
		"inactive", "deactivated")
	if !notified(vht, id, "deactivated") {
		t.Fatal("deactivation did not notify the VHT")
	}
	moved := submission("Workflow Test Bar")
	moved["region_id"], moved["district_id"], moved["subcounty_id"] = otherRegion, otherDistrict, otherSubcounty
	request("PUT", path, moved, vht, 409) // Moving would hand the decision to another district.
	final := data(request("POST", path+"/activate", map[string]any{"comment": "Reopened"}, dcfp, 200))
	state(final, "active", "active")
	actions := []string{}
	for _, comment := range final["comments"].([]any) {
		actions = append(actions, comment.(map[string]any)["action"].(string))
	}
	if len(actions) != 5 || actions[3] != "deactivated" || actions[4] != "activated" {
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

	// Rejection keeps the hotspot inactive until the VHT resubmits it by editing.
	rejectedBody := submission("Rejected Test Inn")
	rejected := data(request("POST", "/hotspots", rejectedBody, vht, 201))["id"].(string)
	rejectedPath := "/hotspots/" + rejected
	request("POST", rejectedPath+"/reject", map[string]any{}, dcfp, 422)
	request("POST", rejectedPath+"/reject", map[string]any{"comment": "Duplicate"}, otherDCFP, 404)
	state(data(request("POST", rejectedPath+"/reject", map[string]any{"comment": "Duplicate of Seja inn"}, dcfp, 200)),
		"inactive", "rejected")
	if !notified(vht, rejected, "rejected") {
		t.Fatal("rejection did not notify the VHT")
	}
	request("POST", rejectedPath+"/reject", map[string]any{"comment": "Again"}, dcfp, 409)
	request("POST", rejectedPath+"/activate", reason, dcfp, 409)
	if !listed(dcfp, "?status=inactive", rejected) {
		t.Fatal("a rejected hotspot should list as inactive")
	}
	rejectedBody["latitude"] = 0.36
	state(data(request("PUT", rejectedPath, rejectedBody, vht, 200)), "inactive", "submitted")
	if !notified(dcfp, rejected, "resubmitted") {
		t.Fatal("resubmission did not notify the district")
	}
	state(data(request("POST", rejectedPath+"/activate", reason, dcfp, 200)), "active", "active")
	request("POST", path+"/reject", reason, dcfp, 409) // Active hotspots are deactivated, not rejected.

	// Lists put the most recently updated hotspot first; a comment counts.
	second := data(request("POST", "/hotspots", submission("Second Test Lodge"), vht, 201))["id"].(string)
	request("POST", path+"/comments", map[string]any{"comment": "Restocked"}, vht, 201)
	first := request("GET", "/hotspots?limit=2", nil, vht, 200)["data"].([]any)
	if len(first) != 2 || first[0].(map[string]any)["id"] != id || first[1].(map[string]any)["id"] != second {
		t.Fatalf("list order: %v", first)
	}
	if !notified(dcfp, id, "commented") {
		t.Fatal("submitter comment did not notify the district")
	}
	if len(request("GET", "/hotspots/districts", nil, vht, 200)["data"].([]any)) < 146 {
		t.Fatal("district picker is missing the converted districts")
	}
}
