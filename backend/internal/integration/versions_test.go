package integration

import (
	"context"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

// testExportsAndVersions checks report exports and approved versions (RF15, RN02, RN04) after the
// settings checks, with the hotspot's 290 acknowledged male pieces this month.
func testExportsAndVersions(t *testing.T, pool *pgxpool.Pool,
	request func(string, string, any, string, int) map[string]any,
	admin, districtToken, district string,
) {
	t.Helper()
	data := func(method, path string, body any, token string, code int) map[string]any {
		t.Helper()
		return request(method, path, body, token, code)["data"].(map[string]any)
	}
	male := func(table map[string]any) float64 {
		var sum float64
		for _, row := range table["rows"].([]any) {
			sum += row.(map[string]any)["ct12_male_pieces"].(float64)
		}
		return sum
	}

	// An export carries the rows behind the screen with its period, scope and product (RF15, RN02).
	exported := data("GET", "/reports/export/notifications?format=json", nil, admin, 200)
	summary := data("GET", "/reports/notifications", nil, admin, 200)
	if float64(len(exported["rows"].([]any))) != summary["notifications_raised"].(float64) || exported["scope"] != "National" ||
		exported["product"] != "Male and female condoms" || exported["filters"].(map[string]any)["from"] != summary["period"].(map[string]any)["from"] {
		t.Fatalf("notification export does not match the report: %v", exported)
	}
	// Each report names the date that places a record in its period.
	if exported["date_basis"] != summary["date_basis"] || !strings.HasPrefix(exported["date_basis"].(string), "Date the notification was first raised") {
		t.Fatalf("notification export date basis: %v, report: %v", exported["date_basis"], summary["date_basis"])
	}
	if hmis := data("GET", "/reports/export/hmis-105?format=json", nil, admin, 200); male(hmis) != 290 {
		t.Fatalf("HMIS export: %v", hmis)
	}
	request("GET", "/reports/export/unknown", nil, admin, 400)
	request("GET", "/reports/export/stock?colour=red", nil, admin, 400)
	request("GET", "/reports/export/stock?format=xml", nil, admin, 400)

	// An approved version freezes the figures; a correction recalculates with a reason and keeps the original (RN04).
	request("POST", "/reports/versions", map[string]any{"report": "hmis-105"}, districtToken, 403)
	first := data("POST", "/reports/versions", map[string]any{"report": "hmis-105", "note": "November review"}, admin, 201)
	if first["status"] != "approved" || male(first["export"].(map[string]any)) != 290 || first["filters"].(map[string]any)["month"] == "" {
		t.Fatalf("approved version: %v", first)
	}
	id := first["id"].(string)
	ctx := context.Background()
	if _, err := pool.Exec(ctx, `UPDATE hotspot_delivery_lines SET acknowledged_pieces = acknowledged_pieces + 10
		WHERE category = 'male' AND acknowledged_at IS NOT NULL AND acknowledged_pieces > 0`); err != nil {
		t.Fatal(err)
	}
	defer func() {
		if _, err := pool.Exec(ctx, `UPDATE hotspot_delivery_lines SET acknowledged_pieces = acknowledged_pieces - 10
			WHERE category = 'male' AND acknowledged_at IS NOT NULL AND acknowledged_pieces > 10`); err != nil {
			t.Error(err)
		}
	}()
	request("POST", "/reports/versions/"+id+"/corrections", map[string]any{"reason": " "}, admin, 422)
	second := data("POST", "/reports/versions/"+id+"/corrections", map[string]any{"reason": "Late acknowledgement fixed"}, admin, 201)
	if second["supersedes_id"] != id || second["correction_reason"] != "Late acknowledgement fixed" || male(second["export"].(map[string]any)) == 290 {
		t.Fatalf("correction: %v", second)
	}
	original := data("GET", "/reports/versions/"+id, nil, admin, 200)
	if original["status"] != "superseded" || original["superseded_by_id"] != second["id"] || male(original["export"].(map[string]any)) != 290 {
		t.Fatalf("the corrected version must keep its figures: %v", original)
	}
	request("POST", "/reports/versions/"+id+"/corrections", map[string]any{"reason": "again"}, admin, 409)

	// A district approves its own versions; it cannot see national ones, and national users cannot correct its own.
	var dfcpRole string
	if err := pool.QueryRow(ctx, `SELECT id FROM roles WHERE name = 'dfcp'`).Scan(&dfcpRole); err != nil {
		t.Fatal(err)
	}
	request("PUT", "/roles/"+dfcpRole+"/permissions", map[string]any{"permissions": []string{"orders:read", "orders:replenish",
		"orders:receive", "orders:supply_hotspots", "reports:read", "reports:configure", "reports:approve"}}, admin, 200)
	request("GET", "/reports/versions/"+id, nil, districtToken, 404)
	own := data("POST", "/reports/versions", map[string]any{"report": "notifications", "filters": map[string]any{"category": "male"}}, districtToken, 201)
	if own["store_id"] != district || own["export"].(map[string]any)["product"] != "Male condoms" {
		t.Fatalf("district version: %v", own)
	}
	if list := request("GET", "/reports/versions", nil, districtToken, 200)["data"].([]any); len(list) != 1 {
		t.Fatalf("a district sees only its versions: %v", list)
	}
	if list := request("GET", "/reports/versions?report=hmis-105", nil, admin, 200)["data"].([]any); len(list) != 2 {
		t.Fatalf("national users see every version: %v", list)
	}
	request("POST", "/reports/versions/"+own["id"].(string)+"/corrections", map[string]any{"reason": "x"}, admin, 403)
}
