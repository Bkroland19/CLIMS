package integration

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// testNotificationFulfilment follows a hotspot notification from one type, repeated as Both, through two
// district deliveries and the manager's acknowledgements to fulfilment, checking the reports at each
// step (reporting requirements RF02-RF08). openReport is the hotspot's open Male or Female notification.
func testNotificationFulfilment(t *testing.T, pool *pgxpool.Pool,
	request func(string, string, any, string, int) map[string]any,
	admin, managerToken, districtToken, otherDistrictToken, district, hotSpot, unit, openReport string,
) {
	t.Helper()
	ctx := context.Background()
	exec := func(sql string, args ...any) {
		t.Helper()
		if _, err := pool.Exec(ctx, sql, args...); err != nil {
			t.Fatal(err)
		}
	}
	var male, female string
	if err := pool.QueryRow(ctx, `SELECT (SELECT id FROM condoms WHERE active AND category = 'male' ORDER BY id LIMIT 1),
		(SELECT id FROM condoms WHERE active AND category = 'female' ORDER BY id LIMIT 1)`).Scan(&male, &female); err != nil {
		t.Fatal(err)
	}
	// Pieces are counted in each product's catalogue unit: 100 male or 10 female pieces per unit. Later
	// catalogue checks read these products, so put them back as found.
	for _, product := range []string{male, female} {
		var unitID *string
		var pieces *int32
		if err := pool.QueryRow(ctx, `SELECT unit_id, pieces_per_unit FROM condoms WHERE id = $1`, product).Scan(&unitID, &pieces); err != nil {
			t.Fatal(err)
		}
		defer exec(`UPDATE condoms SET unit_id = $2, pieces_per_unit = $3 WHERE id = $1`, product, unitID, pieces)
	}
	exec(`UPDATE condoms SET unit_id = $2, pieces_per_unit = CASE category WHEN 'male' THEN 100 ELSE 10 END
		WHERE id IN ($1, $3)`, male, unit, female)
	for _, product := range []string{male, female} {
		request("POST", "/inventory/movements", map[string]any{"store_id": district, "condom_id": product,
			"unit_of_measure_id": unit, "reason": "receipt", "quantity": 20, "note": "Stock for hotspots"}, admin, 201)
	}
	var dfcpRole string
	if err := pool.QueryRow(ctx, `SELECT id FROM roles WHERE name = 'dfcp'`).Scan(&dfcpRole); err != nil {
		t.Fatal(err)
	}
	request("PUT", "/roles/"+dfcpRole+"/permissions", map[string]any{"permissions": []string{"orders:read",
		"orders:replenish", "orders:receive", "orders:supply_hotspots", "reports:read"}}, admin, 200)
	detailPath := "/orders/stockouts/" + openReport
	detail := func(token string) map[string]any {
		t.Helper()
		return request("GET", detailPath, nil, token, 200)["data"].(map[string]any)
	}
	summary := func(token, query string) map[string]any {
		t.Helper()
		return request("GET", "/reports/notifications?hot_spot_id="+hotSpot+query, nil, token, 200)["data"].(map[string]any)
	}
	expect := func(what string, data map[string]any, want map[string]any) {
		t.Helper()
		for key, value := range want {
			if data[key] != value {
				t.Fatalf("%s: %s = %v, want %v (%v)", what, key, data[key], value, data)
			}
		}
	}

	// RF02: a repeated message joins the open notification; naming the other type makes it Both. The
	// inventory checks have already repeated this notification once with its own type.
	stockout := func(body map[string]any, code int) map[string]any {
		t.Helper()
		body["hot_spot_id"] = hotSpot
		return request("POST", "/orders/stockouts", body, managerToken, code)
	}
	stockout(map[string]any{"condom_category": "Male"}, 422)
	stockout(map[string]any{}, 422)
	other := map[any]string{"male": "female", "female": "male"}[detail(managerToken)["selection"]]
	if other == "" {
		t.Fatal("the open notification should name one type")
	}
	repeated := stockout(map[string]any{"condom_category": other, "message": "Still out"}, 200)["data"].(map[string]any)
	expect("repeat", repeated, map[string]any{"id": openReport, "selection": "both", "repeat_count": float64(2),
		"status": "awaiting_supply"})
	stockout(map[string]any{"condom_category": "both"}, 200)
	report := detail(managerToken)
	var actions []string
	for _, event := range report["events"].([]any) {
		actions = append(actions, event.(map[string]any)["action"].(string))
	}
	if strings.Join(actions, ",") != "raised,repeated,selection_changed,repeated" {
		t.Fatalf("notification history: %v", actions)
	}
	before := summary(admin, "")
	expect("summary before supply", before, map[string]any{"notifications_raised": float64(1),
		"awaiting_supply": float64(1), "fulfilment_rate": float64(0)})
	if before["by_selection"].(map[string]any)["both"] != float64(1) {
		t.Fatalf("by selection: %v", before["by_selection"])
	}

	// RF03: the district delivers against the notification, out of its available stock.
	deliveries := "/orders/stockouts/" + openReport + "/deliveries"
	firstDelivery := map[string]any{"client_reference": "delivery-1", "note": "Rider: Moses",
		"lines": []map[string]any{{"condom_id": male, "quantity": 3}, {"condom_id": female, "quantity": 10}}}
	request("POST", deliveries, firstDelivery, managerToken, 403)       // no orders:supply_hotspots
	request("POST", deliveries, firstDelivery, otherDistrictToken, 404) // another district's notification
	request("POST", deliveries, map[string]any{"lines": []map[string]any{{"condom_id": male, "quantity": 1000}}}, districtToken, 409)
	request("POST", deliveries, map[string]any{"lines": []map[string]any{}}, districtToken, 422)
	delivered := request("POST", deliveries, firstDelivery, districtToken, 201)["data"].(map[string]any)
	expect("after delivery", delivered, map[string]any{"status": "awaiting_acknowledgement"})
	// A retried send with the same reference records nothing twice.
	if again := request("POST", deliveries, firstDelivery, districtToken, 200)["data"].(map[string]any); len(again["deliveries"].([]any)) != 1 {
		t.Fatalf("a retried delivery was recorded twice: %v", again["deliveries"])
	}
	var ledgerLines int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM inventory_movements WHERE reason = 'hotspot_delivery'`).Scan(&ledgerLines); err != nil {
		t.Fatal(err)
	}
	if ledgerLines != 2 {
		t.Fatalf("hotspot delivery ledger lines = %d, want 2", ledgerLines)
	}
	lineIDs := map[string]string{}
	for _, line := range delivered["deliveries"].([]any)[0].(map[string]any)["lines"].([]any) {
		l := line.(map[string]any)
		lineIDs[l["category"].(string)] = l["id"].(string)
		want := map[string]float64{"male": 300, "female": 100}[l["category"].(string)]
		if l["pieces"] != want {
			t.Fatalf("%s line pieces = %v, want %v", l["category"], l["pieces"], want)
		}
	}
	if !hasNotification(t, request, managerToken, "order.hotspot_delivery", "300 male and 100 female pieces") {
		t.Fatal("the hotspot manager was not told what is on the way")
	}

	// RF04: only the manager acknowledges, per line, in pieces actually received.
	acknowledgements := "/orders/stockouts/" + openReport + "/acknowledgements"
	ack := func(token string, lines map[string]int, code int) map[string]any {
		t.Helper()
		body := []map[string]any{}
		for category, pieces := range lines {
			body = append(body, map[string]any{"line_id": lineIDs[category], "pieces": pieces})
		}
		result := request("POST", acknowledgements, map[string]any{"lines": body}, token, code)
		if code != 200 {
			return nil
		}
		return result["data"].(map[string]any)
	}
	ack(districtToken, map[string]int{"male": 300}, 403)
	ack(admin, map[string]int{"male": 300}, 403)
	expect("male acknowledged", ack(managerToken, map[string]int{"male": 290}, 200), map[string]any{"status": "partly_received", "fulfilled_at": nil})
	ack(managerToken, map[string]int{"male": 290}, 200) // a repeated send is counted once
	ack(managerToken, map[string]int{"male": 280}, 409) // a different count is a correction, not a resend
	// Nothing female arrived: a zero count keeps the notification partly received.
	expect("female missing", ack(managerToken, map[string]int{"female": 0}, 200), map[string]any{"status": "partly_received"})
	partly := summary(admin, "&category=female")
	expect("summary partly received", partly, map[string]any{"partly_received": float64(1), "notifications_fulfilled": float64(0)})
	expect("female component", partly["component"].(map[string]any), map[string]any{"notifications": float64(1), "fulfilled": float64(0)})
	expect("male component", summary(admin, "&category=male")["component"].(map[string]any), map[string]any{"fulfilled": float64(1)})

	// A second delivery and its acknowledgement complete every selected type.
	second := request("POST", deliveries, map[string]any{"lines": []map[string]any{{"condom_id": female, "quantity": 10}}},
		districtToken, 201)["data"].(map[string]any)
	secondLine := second["deliveries"].([]any)[1].(map[string]any)["lines"].([]any)[0].(map[string]any)["id"].(string)
	done := request("POST", acknowledgements, map[string]any{"lines": []map[string]any{{"line_id": secondLine, "pieces": 100}}},
		managerToken, 200)["data"].(map[string]any)
	if done["status"] != "fulfilled" || done["fulfilled_at"] == nil {
		t.Fatalf("notification not fulfilled: %v", done)
	}
	if !hasNotification(t, request, districtToken, "order.delivery_acknowledged", "is fulfilled") {
		t.Fatal("the district was not told the notification is fulfilled")
	}
	request("POST", deliveries, map[string]any{"lines": []map[string]any{{"condom_id": male, "quantity": 1}}}, districtToken, 409)

	// RF05-RF08: the totals, rates, response time and the records behind them.
	after := summary(admin, "")
	expect("summary fulfilled", after, map[string]any{"notifications_raised": float64(1), "notifications_fulfilled": float64(1),
		"fulfilment_rate": float64(100), "partly_received": float64(0), "acknowledgement_overdue": float64(0)})
	if response := after["response"].(map[string]any); response["median_hours"] == nil || response["fulfilled_included"] != float64(1) {
		t.Fatalf("response duration: %v", response)
	}
	expect("deadline", after["deadline"].(map[string]any), map[string]any{"days": float64(7), "target_percent": float64(80),
		"fulfilled_on_time": float64(1), "on_time_rate": float64(100), "target_met": true})
	if districts := after["districts"].([]any); len(districts) != 1 || districts[0].(map[string]any)["notifications_fulfilled"] != float64(1) {
		t.Fatalf("district comparison: %v", districts)
	}
	records := request("GET", "/reports/notifications/records?hot_spot_id="+hotSpot, nil, districtToken, 200)["data"].([]any)
	if len(records) != 1 {
		t.Fatalf("records: %v", records)
	}
	expect("record", records[0].(map[string]any), map[string]any{"id": openReport, "status": "fulfilled", "selection": "both",
		"delivered_male_pieces": float64(300), "received_male_pieces": float64(290),
		"delivered_female_pieces": float64(200), "received_female_pieces": float64(100)})
	request("GET", "/reports/notifications/records?status=lost", nil, districtToken, 400)

	// RN01: another district's DCFP cannot see this notification, even by asking for the hotspot.
	expect("other district", summary(otherDistrictToken, ""), map[string]any{"notifications_raised": float64(0), "fulfilment_rate": nil})
	request("GET", detailPath, nil, otherDistrictToken, 404)
	request("GET", "/reports/notifications", nil, managerToken, 403) // no reports:read
	// The period is a set of Kampala days; tomorrow has no notifications yet.
	tomorrow := time.Now().In(time.FixedZone("EAT", 3*3600)).AddDate(0, 0, 1).Format(time.DateOnly)
	expect("future period", summary(admin, "&from="+tomorrow+"&to="+tomorrow), map[string]any{"notifications_raised": float64(0)})
	request("GET", "/reports/notifications?from=2026-11-05&to=2026-11-01", nil, admin, 400)

	// A fulfilled notification is closed: the next stockout opens a new one.
	if next := stockout(map[string]any{"condom_category": "male"}, 201)["data"].(map[string]any); next["id"] == openReport {
		t.Fatal("a stockout after fulfilment reopened the old notification")
	}
}

// hasNotification reports whether the user's inbox holds a notification of the type whose body
// contains text.
func hasNotification(t *testing.T, request func(string, string, any, string, int) map[string]any, token, typeName, text string) bool {
	t.Helper()
	for _, item := range request("GET", "/notifications?limit=100", nil, token, 200)["data"].([]any) {
		n := item.(map[string]any)
		if n["type"] == typeName && strings.Contains(n["body"].(string), text) {
			return true
		}
	}
	return false
}
