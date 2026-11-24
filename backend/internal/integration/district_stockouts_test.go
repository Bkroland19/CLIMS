package integration

import (
	"context"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

// testDistrictStockouts covers VHTs raising stockout alerts on behalf of active hotspots in the district
// they work in, and seeing that district's active hotspots to choose from.
func testDistrictStockouts(t *testing.T, pool *pgxpool.Pool,
	request func(string, string, any, string, int) map[string]any,
	login func(string, string, int) string,
	admin, product string,
) {
	t.Helper()
	ctx := context.Background()
	scalar := func(dest any, sql string, args ...any) {
		t.Helper()
		if err := pool.QueryRow(ctx, sql, args...).Scan(dest); err != nil {
			t.Fatal(err)
		}
	}
	exec := func(sql string, args ...any) {
		t.Helper()
		if _, err := pool.Exec(ctx, sql, args...); err != nil {
			t.Fatal(err)
		}
	}

	// Migration 21 adds the permissions; administrators grant them, as with every other role.
	var added int
	scalar(&added, `SELECT count(*) FROM permissions WHERE name IN ('orders:stockout_district', 'hotspots:read_district')`)
	if added != 2 {
		t.Fatalf("migration 21 should add both district permissions, found %d", added)
	}

	// A district with a district store (alerts go there) and a subcounty, and another district.
	var district, subcounty, otherDistrict, otherSubcounty string
	scalar(&district, `SELECT d.id FROM districts d JOIN stores st ON st.district_id = d.id AND st.store_type = 'district'
		JOIN subcounties s ON s.district_id = d.id ORDER BY d.uid LIMIT 1`)
	scalar(&subcounty, `SELECT id FROM subcounties WHERE district_id = $1 ORDER BY uid LIMIT 1`, district)
	scalar(&otherSubcounty, `SELECT id FROM subcounties WHERE district_id <> $1 ORDER BY uid LIMIT 1`, district)
	scalar(&otherDistrict, `SELECT district_id FROM subcounties WHERE id = $1`, otherSubcounty)

	// Three hotspots: active in the district, inactive in the district, active elsewhere.
	ids := make([]string, 0, 3)
	rows, err := pool.Query(ctx, `SELECT id FROM hot_spots ORDER BY id LIMIT 3 OFFSET 40`)
	if err != nil {
		t.Fatal(err)
	}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			t.Fatal(err)
		}
		ids = append(ids, id)
	}
	rows.Close()
	active, inactive, elsewhere := ids[0], ids[1], ids[2]
	// Later checks count the converted legacy hotspots, so put these three back as found.
	type saved struct {
		id, status, review  string
		district, subcounty *string
	}
	originals := make([]saved, 0, len(ids))
	for _, id := range ids {
		var row saved
		row.id = id
		scalar(&row.status, `SELECT status FROM hot_spots WHERE id = $1`, id)
		scalar(&row.review, `SELECT review_status FROM hot_spots WHERE id = $1`, id)
		scalar(&row.district, `SELECT district_id FROM hot_spots WHERE id = $1`, id)
		scalar(&row.subcounty, `SELECT subcounty_id FROM hot_spots WHERE id = $1`, id)
		originals = append(originals, row)
	}
	defer func() {
		for _, row := range originals {
			exec(`UPDATE hot_spots SET status = $2, review_status = $3, district_id = $4, subcounty_id = $5 WHERE id = $1`,
				row.id, row.status, row.review, row.district, row.subcounty)
		}
	}()
	// A hotspot's subcounty must sit in its district, so both move together.
	place := func(id, district, subcounty, status, review string) {
		t.Helper()
		exec(`UPDATE hot_spots SET district_id = $2, subcounty_id = $3, status = $4, review_status = $5 WHERE id = $1`,
			id, district, subcounty, status, review)
	}
	place(active, district, subcounty, "active", "active")
	place(inactive, district, subcounty, "inactive", "deactivated")
	place(elsewhere, otherDistrict, otherSubcounty, "active", "active")

	roleID := func(role string) string {
		t.Helper()
		var id string
		scalar(&id, `SELECT id FROM roles WHERE name = $1`, role)
		return id
	}
	request("PUT", "/roles/"+roleID("vht")+"/permissions", map[string]any{"permissions": []string{
		"hotspots:read", "hotspots:submit", "hotspots:read_district", "orders:stockout", "orders:stockout_district",
	}}, admin, 200)
	account := func(role, name string) string {
		t.Helper()
		email := name + "@example.test"
		id := request("POST", "/users", map[string]any{
			"username": name, "email": email, "password": "test-password-123", "role_ids": []string{roleID(role)},
		}, admin, 201)["data"].(map[string]any)["user_id"].(string)
		// The VHT works in the district through their subcounty alone: no store assignment.
		exec(`UPDATE users SET subcounty_id = $2, store_id = NULL WHERE id = $1`, id, subcounty)
		return login(email, "test-password-123", 200)
	}
	vht := account("vht", "district-vht")

	// The district's active hotspots are visible; inactive ones and other districts' are not.
	request("GET", "/hotspots/"+active, nil, vht, 200)
	request("GET", "/hotspots/"+inactive, nil, vht, 404)
	request("GET", "/hotspots/"+elsewhere, nil, vht, 404)
	for _, item := range request("GET", "/hotspots?status=active&limit=100", nil, vht, 200)["data"].([]any) {
		h := item.(map[string]any)
		if h["district"].(map[string]any)["id"] != district || h["status"] != "active" {
			t.Fatalf("VHT listed a hotspot outside their district's active ones: %v", h)
		}
	}
	// Seeing a hotspot to request stock for doesn't open its thread to the VHT.
	request("POST", "/hotspots/"+active+"/comments", map[string]any{"comment": "Hello"}, vht, 404)

	// Reports: accepted for the active district hotspot, refused for the others.
	alert := func(hotSpot string, want int) map[string]any {
		t.Helper()
		return request("POST", "/orders/stockouts", map[string]any{
			"hot_spot_id": hotSpot, "condom_category": "male", "message": "Out of stock",
		}, vht, want)
	}
	raised := alert(active, 201)["data"].(map[string]any)
	if raised["hot_spot_id"] != active || raised["comment"] != "Out of stock" {
		t.Fatalf("district report should name the hotspot and carry the message: %v", raised)
	}
	alert(inactive, 403)
	alert(elsewhere, 403)

	// RF12: the map shows each hotspot's open notification, and can be filtered by it. The VHT sees where
	// a district hotspot is only to the subcounty, without its village, coordinates or contact; national
	// users, and the VHT who submitted it, see them.
	exec(`UPDATE hot_spots SET latitude = 0.3476, longitude = 32.5825, village = 'Precision village' WHERE id = $1`, active)
	exec(`INSERT INTO contact_persons (hot_spot_id, name, phone_number) VALUES ($1, 'Precision contact', '0700000001')`, active)
	defer exec(`DELETE FROM contact_persons WHERE name = 'Precision contact'`)
	seen := func(token string) map[string]any {
		t.Helper()
		return request("GET", "/hotspots/"+active, nil, token, 200)["data"].(map[string]any)
	}
	if h := seen(vht); h["location_precision"] != "subcounty" || h["latitude"] != nil || h["longitude"] != nil ||
		h["village"] != nil || h["contact_person"] != nil || h["subcounty"].(map[string]any)["id"] != subcounty ||
		h["notification_status"] != "awaiting_supply" {
		t.Fatalf("a district VHT should see the hotspot to the subcounty only: %v", h)
	}
	if h := seen(admin); h["location_precision"] != "exact" || h["latitude"] != 0.3476 || h["village"] != "Precision village" ||
		h["contact_person"].(map[string]any)["name"] != "Precision contact" || h["notification_status"] != "awaiting_supply" {
		t.Fatalf("national users see the exact location and contact: %v", h)
	}
	listed := func(query string) map[string]bool {
		t.Helper()
		out := map[string]bool{}
		for _, item := range request("GET", "/hotspots?limit=100&"+query, nil, vht, 200)["data"].([]any) {
			out[item.(map[string]any)["id"].(string)] = true
		}
		return out
	}
	if !listed("notification_status=awaiting_supply")[active] || listed("notification_status=none")[active] {
		t.Fatal("the notification_status filter should find the hotspot by its open notification")
	}
	request("GET", "/hotspots?notification_status=fulfilled", nil, vht, 400)
	var vhtID, submitter string
	scalar(&vhtID, `SELECT id FROM users WHERE username = 'district-vht'`)
	scalar(&submitter, `SELECT coalesce(submitted_by_id::text, '') FROM hot_spots WHERE id = $1`, active)
	exec(`UPDATE hot_spots SET submitted_by_id = $2 WHERE id = $1`, active, vhtID)
	if h := seen(vht); h["location_precision"] != "exact" || h["latitude"] != 0.3476 {
		t.Fatalf("the VHT who submitted the hotspot sees where it is: %v", h)
	}
	exec(`UPDATE hot_spots SET submitted_by_id = nullif($2, '')::uuid WHERE id = $1`, active, submitter)
	// The VHT follows the request they sent without orders:read, but lists nothing.
	reportPath := "/orders/stockouts/" + raised["id"].(string)
	if seen := request("GET", reportPath, nil, vht, 200)["data"].(map[string]any); seen["id"] != raised["id"] {
		t.Fatalf("the VHT's own report: %v", seen)
	}
	request("GET", "/orders/stockouts", nil, vht, 403)
	// A second VHT reporting the same hotspot joins its open request, and can follow it too.
	second := account("vht", "district-vht-2")
	joined := request("POST", "/orders/stockouts", map[string]any{"hot_spot_id": active, "condom_category": "female",
		"message": "Still out"}, second, 200)["data"].(map[string]any)
	if joined["id"] != raised["id"] {
		t.Fatalf("the second report should join the open request: %v", joined)
	}
	request("GET", reportPath, nil, second, 200)

	// orders:stockout alone still means the assigned hotspot only.
	request("PUT", "/roles/"+roleID("healthy facility")+"/permissions",
		map[string]any{"permissions": []string{"orders:stockout"}}, admin, 200)
	facility := account("healthy facility", "district-facility")
	request("POST", "/orders/stockouts", map[string]any{"hot_spot_id": active, "condom_category": "male"}, facility, 403)
	// Reporting stockouts opens only one's own reports, not another reporter's.
	request("GET", reportPath, nil, facility, 404)
}
