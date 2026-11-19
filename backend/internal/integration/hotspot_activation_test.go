package integration

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// testHotSpotActivation walks the activation map: a VHT submits, the district DCFP is notified,
// verifies and activates, with the role grants an operator makes through the RBAC API.
func testHotSpotActivation(t *testing.T, pool *pgxpool.Pool,
	request func(string, string, any, string, int) map[string]any,
	login func(string, string, int) string,
	admin, districtStore string,
) {
	t.Helper()
	ctx := context.Background()
	var district string
	if err := pool.QueryRow(ctx, `SELECT district_id FROM stores WHERE id = $1`, districtStore).Scan(&district); err != nil {
		t.Fatal(err)
	}
	grants := map[string][]string{"vht": {"hotspots:read", "hotspots:submit"}, "dfcp": {"hotspots:read", "hotspots:activate"}}
	account := func(role, name string, store *string) string {
		t.Helper()
		var roleID string
		if err := pool.QueryRow(ctx, `SELECT id FROM roles WHERE name = $1`, role).Scan(&roleID); err != nil {
			t.Fatal(err)
		}
		request("PUT", "/roles/"+roleID+"/permissions", map[string]any{"permissions": grants[role]}, admin, 200)
		email := name + "@example.test"
		profile := request("POST", "/users", map[string]any{
			"username": name, "email": email, "password": "test-password-123", "role_ids": []string{roleID},
		}, admin, 201)["data"].(map[string]any)
		if _, err := pool.Exec(ctx, `UPDATE users SET store_id = $2 WHERE id = $1`, profile["user_id"], store); err != nil {
			t.Fatal(err)
		}
		return login(email, "test-password-123", 200)
	}
	vht := account("vht", "activation-vht", nil)
	dcfp := account("dfcp", "activation-dcfp", &districtStore)
	outsider := account("dfcp", "activation-outsider", nil)

	found := false
	for _, item := range request("GET", "/hotspots/districts", nil, vht, 200)["data"].([]any) {
		found = found || item.(map[string]any)["id"] == district
	}
	if !found {
		t.Fatal("district missing from the submission picker")
	}

	details := map[string]any{"name": "Lake view bar", "district_id": district, "village": "Seja",
		"type": "Guest house", "has_condom_dispenser": true, "dispenser_condition": "Poor",
		"latitude": 0.31, "longitude": 32.63}
	request("POST", "/hotspots", details, dcfp, 403)
	request("POST", "/hotspots", map[string]any{"name": "Bar", "district_id": uuid.NewString()}, vht, 422)
	submit := func() string {
		t.Helper()
		hotspot := request("POST", "/hotspots", details, vht, 201)["data"].(map[string]any)
		if hotspot["status"] != "submitted" || hotspot["district_id"] != district || hotspot["latitude"] != 0.31 ||
			hotspot["type"] != "Guest house" || hotspot["has_condom_dispenser"] != true || hotspot["dispenser_condition"] != "Poor" {
			t.Fatalf("unexpected submission: %v", hotspot)
		}
		return hotspot["id"].(string)
	}
	notified := func(token, id, action string) bool {
		t.Helper()
		for _, event := range request("GET", "/hotspots/notifications", nil, token, 200)["data"].([]any) {
			if e := event.(map[string]any); e["hot_spot_id"] == id && e["action"] == action {
				return true
			}
		}
		return false
	}
	act := func(id, action, token string, body any, code int, status string) map[string]any {
		t.Helper()
		result := request("POST", "/hotspots/"+id+"/actions/"+action, body, token, code)
		if code != 200 {
			return nil
		}
		data := result["data"].(map[string]any)
		if data["status"] != status {
			t.Fatalf("%s: expected %s, got %v", action, status, result)
		}
		return data
	}

	id := submit()
	if !notified(dcfp, id, "submitted") {
		t.Fatal("district DCFP was not notified of the submission")
	}
	if events := request("GET", "/hotspots/notifications", nil, outsider, 200)["data"].([]any); len(events) != 0 {
		t.Fatalf("notification leaked outside the district: %v", events)
	}
	act(id, "verify", vht, nil, 403, "")
	act(id, "verify", outsider, nil, 404, "")
	act(id, "approve", dcfp, nil, 404, "")
	act(id, "activate", dcfp, nil, 409, "")
	act(id, "verify", dcfp, map[string]any{"reason": "not needed"}, 422, "")
	act(id, "verify", dcfp, nil, 200, "verified")
	act(id, "verify", dcfp, nil, 409, "")
	if notified(vht, id, "verify") {
		t.Fatal("verification should not notify the VHT")
	}
	act(id, "activate", dcfp, nil, 200, "active")
	if !notified(vht, id, "activate") {
		t.Fatal("VHT was not notified of activation")
	}
	act(id, "reject", dcfp, map[string]any{"reason": "Duplicate"}, 409, "")

	rejected := submit()
	act(rejected, "reject", dcfp, nil, 422, "")
	act(rejected, "reject", dcfp, map[string]any{"reason": "  "}, 422, "")
	result := act(rejected, "reject", dcfp, map[string]any{"reason": " Already mapped as Seja bar "}, 200, "rejected")
	if result["rejection_reason"] != "Already mapped as Seja bar" {
		t.Fatalf("rejection reason not recorded: %v", result)
	}
	if !notified(vht, rejected, "reject") {
		t.Fatal("VHT was not notified of rejection")
	}
	act(rejected, "verify", dcfp, nil, 409, "")

	found = false
	for _, item := range request("GET", "/hotspots?status=active", nil, vht, 200)["data"].([]any) {
		found = found || item.(map[string]any)["id"] == id
	}
	if !found {
		t.Fatal("submitter cannot see the activated hotspot")
	}
}
