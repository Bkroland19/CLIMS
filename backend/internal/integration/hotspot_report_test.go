package integration

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// testHotspotReport checks the hotspot status report (RF13): counts by status and district, each
// hotspot's effective date from its history, contact-only hotspots, the period's decisions, access
// by district, and the export. Other tests leave hotspots behind, so it compares counts before and
// after adding its own.
func testHotspotReport(t *testing.T, pool *pgxpool.Pool,
	request func(string, string, any, string, int) map[string]any,
	admin, districtToken, otherDistrictToken, district string,
) {
	t.Helper()
	ctx := context.Background()
	exec := func(sql string, args ...any) {
		t.Helper()
		if _, err := pool.Exec(ctx, sql, args...); err != nil {
			t.Fatal(err)
		}
	}
	data := func(path, token string) map[string]any {
		t.Helper()
		return request("GET", path, nil, token, 200)["data"].(map[string]any)
	}
	inDistrict := districtID(t, pool, district)
	var elsewhere, actor string
	if err := pool.QueryRow(ctx, `SELECT id FROM districts WHERE id <> $1 ORDER BY id LIMIT 1`, inDistrict).Scan(&elsewhere); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `SELECT id FROM users ORDER BY created_at LIMIT 1`).Scan(&actor); err != nil {
		t.Fatal(err)
	}
	// Decisions are counted from yesterday, so the test holds just after Kampala midnight too.
	yesterday := time.Now().In(time.FixedZone("EAT", 3*3600)).AddDate(0, 0, -1).Format(time.DateOnly)
	summaryPath := "/reports/hotspot-status?from=" + yesterday + "&district_id=" + inDistrict
	counts := func(token string) (map[string]any, map[string]any) {
		t.Helper()
		report := data(summaryPath, token)
		return report["total"].(map[string]any), report["decisions"].(map[string]any)
	}
	totalBefore, decisionsBefore := counts(admin)
	otherBefore, _ := counts(otherDistrictToken)

	now := time.Now()
	hotspot := func(name, district, review string, contact bool, events ...any) string {
		t.Helper()
		status := "inactive"
		if review == "active" {
			status = "active"
		}
		var id string
		if err := pool.QueryRow(ctx, `INSERT INTO hot_spots (name, village, district_id, status, review_status)
			VALUES ($1, 'Report test village', $2, $3, $4) RETURNING id`, name, district, status, review).Scan(&id); err != nil {
			t.Fatal(err)
		}
		if contact {
			exec(`INSERT INTO contact_persons (hot_spot_id, name) VALUES ($1, 'Report test contact')`, id)
		}
		for i := 0; i < len(events); i += 2 {
			exec(`INSERT INTO hot_spot_events (hot_spot_id, actor_id, action, status, created_at) VALUES ($1, $2, $3, $4, $5)`,
				id, actor, events[i], review, events[i+1])
		}
		return id
	}
	defer exec(`DELETE FROM hot_spots WHERE name LIKE 'Report test %'`)
	defer exec(`DELETE FROM contact_persons WHERE name = 'Report test contact'`)
	defer exec(`DELETE FROM hot_spot_events WHERE hot_spot_id IN (SELECT id FROM hot_spots WHERE name LIKE 'Report test %')`)
	activatedAt := now.Add(-time.Hour).UTC().Truncate(time.Microsecond)
	active := hotspot("Report test active", inDistrict, "active", true,
		"submitted", now.AddDate(0, 0, -3), "commented", now.Add(-30*time.Minute), "activated", activatedAt)
	hotspot("Report test pending", inDistrict, "submitted", true, "submitted", now.Add(-2*time.Hour))
	rejected := hotspot("Report test rejected", inDistrict, "rejected", false, "rejected", now.Add(-30*time.Minute))
	hotspot("Report test deactivated", inDistrict, "deactivated", false,
		"activated", now.AddDate(0, 0, -40), "deactivated", now.Add(-10*time.Minute))
	hotspot("Report test elsewhere", elsewhere, "active", true, "activated", now.Add(-time.Hour))

	delta := func(what string, before, after map[string]any, want map[string]float64) {
		t.Helper()
		for key, add := range want {
			if after[key].(float64)-before[key].(float64) != add {
				t.Fatalf("%s: %s went from %v to %v, want +%v", what, key, before[key], after[key], add)
			}
		}
	}
	// Only the district's four hotspots count; the comment is not a status decision, and the decisions
	// before the period are left out.
	totalAfter, decisionsAfter := counts(admin)
	delta("totals", totalBefore, totalAfter, map[string]float64{"total": 4, "active": 1, "pending_review": 1,
		"inactive": 1, "rejected": 1, "contact_only": 2})
	delta("decisions", decisionsBefore, decisionsAfter, map[string]float64{"submitted": 1, "activated": 1,
		"rejected": 1, "deactivated": 1, "resubmitted": 0})
	districtTotal, _ := counts(districtToken)
	delta("district reader", totalBefore, districtTotal, map[string]float64{"total": 4})
	// Another district's DCFP sees none of them, even when asking for this district.
	otherAfter, _ := counts(otherDistrictToken)
	delta("other district", otherBefore, otherAfter, map[string]float64{"total": 0})

	report := data(summaryPath, admin)
	if !strings.HasPrefix(report["date_basis"].(string), "Status on the data update date") ||
		len(report["not_recorded"].([]any)) != 2 || report["field_sync"].(map[string]any)["note"] == "" {
		t.Fatalf("hotspot report header: %v", report)
	}
	if rows := report["districts"].([]any); len(rows) != 1 || rows[0].(map[string]any)["district_id"] != inDistrict {
		t.Fatalf("district rows: %v", rows)
	}

	// The records behind the counts carry the status, when it was set and by which event.
	records := func(query, token string) map[string]map[string]any {
		t.Helper()
		out := map[string]map[string]any{}
		for _, raw := range request("GET", "/reports/hotspot-status/records?limit=100&district_id="+inDistrict+query, nil, token, 200)["data"].([]any) {
			row := raw.(map[string]any)
			out[row["id"].(string)] = row
		}
		return out
	}
	all := records("", districtToken)
	got := all[active]
	if got["status"] != "active" || got["effective_event"] != "activated" || got["contact_only"] != true ||
		got["manager_accounts"] != float64(0) {
		t.Fatalf("active hotspot record: %v", got)
	}
	if at, err := time.Parse(time.RFC3339Nano, got["effective_at"].(string)); err != nil || !at.Equal(activatedAt) {
		t.Fatalf("effective date %v, want %v", got["effective_at"], activatedAt)
	}
	if _, ok := got["latitude"]; ok {
		t.Fatalf("records must leave out coordinates: %v", got)
	}
	if only := records("&status=rejected", districtToken); only[rejected] == nil || only[active] != nil {
		t.Fatalf("status filter: %v", only)
	}
	if len(records("", otherDistrictToken)) != 0 {
		t.Fatal("another district's DCFP sees this district's hotspots")
	}
	request("GET", "/reports/hotspot-status/records?status=duplicate", nil, admin, 400)
	request("GET", "/reports/hotspot-status?district_id=nope", nil, admin, 400)

	// The export holds the same rows and names its date basis.
	exported := data("/reports/export/hotspot-status?format=json&district_id="+inDistrict, admin)
	if float64(len(exported["rows"].([]any))) != totalAfter["total"].(float64) || exported["date_basis"] != report["date_basis"] {
		t.Fatalf("hotspot export: %d rows for %v hotspots, date basis %v", len(exported["rows"].([]any)), totalAfter["total"], exported["date_basis"])
	}
}
