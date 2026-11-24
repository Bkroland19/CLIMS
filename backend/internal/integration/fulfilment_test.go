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
// deliveryAgents are two users with orders:deliver: one working in the hotspot's district, one in
// another district, who may not be named for its deliveries.
type deliveryAgents struct {
	id, token, awayID, awayToken string
}

func testNotificationFulfilment(t *testing.T, pool *pgxpool.Pool,
	request func(string, string, any, string, int) map[string]any,
	admin, managerToken, districtToken, otherDistrictToken, district, hotSpot, unit, openReport string,
	riders deliveryAgents,
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
	// The DCFP hears the repeat in its own words, not the first report's message again.
	if !hasNotification(t, request, districtToken, "order.stockout_reported", `Message: "Still out"`) {
		t.Fatal("the DCFP was not told the repeated report's message")
	}
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

	// A delivery agent may be named; only those working in the hotspot's district are offered or
	// accepted, and naming another takes no stock.
	ridersPath := "/orders/stockouts/" + openReport + "/riders"
	request("GET", ridersPath, nil, managerToken, 403)
	request("GET", ridersPath, nil, otherDistrictToken, 404)
	offered := request("GET", ridersPath, nil, districtToken, 200)["data"].([]any)
	if len(offered) != 1 || offered[0].(map[string]any)["id"] != riders.id {
		t.Fatalf("delivery agents offered: %v, want only %s", offered, riders.id)
	}
	firstDelivery["rider_id"] = riders.awayID
	request("POST", deliveries, firstDelivery, districtToken, 422)
	firstDelivery["rider_id"] = "not-a-uuid"
	request("POST", deliveries, firstDelivery, districtToken, 422)
	firstDelivery["rider_id"] = riders.id

	delivered := request("POST", deliveries, firstDelivery, districtToken, 201)["data"].(map[string]any)
	expect("after delivery", delivered, map[string]any{"status": "awaiting_acknowledgement"})
	if carrier, _ := delivered["deliveries"].([]any)[0].(map[string]any)["rider"].(map[string]any); carrier["id"] != riders.id ||
		carrier["name"] != "workflow-rider" {
		t.Fatalf("the delivery's agent: %v", carrier)
	}
	// The agent sees the delivery named for them, with where it goes; nobody else does.
	request("GET", "/orders/deliveries", nil, managerToken, 403)
	if away := request("GET", "/orders/deliveries", nil, riders.awayToken, 200)["data"].([]any); len(away) != 0 {
		t.Fatalf("another agent sees deliveries not named for them: %v", away)
	}
	mine := request("GET", "/orders/deliveries", nil, riders.token, 200)["data"].([]any)
	if len(mine) != 1 {
		t.Fatalf("the agent's deliveries: %v", mine)
	}
	assignment := mine[0].(map[string]any)
	if assignment["stockout_report_id"] != openReport || assignment["hot_spot_id"] != hotSpot ||
		assignment["acknowledged"] != false || len(assignment["lines"].([]any)) != 2 ||
		assignment["hot_spot"].(map[string]any)["contact_phone"] != "0700123456" {
		t.Fatalf("the agent's delivery: %v", assignment)
	}
	if !hasNotification(t, request, riders.token, "order.delivery_assigned", "Peter Okello") {
		t.Fatal("the delivery agent was not notified")
	}
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
	// The district stock screen includes hotspot dispatches in both its period and cover totals.
	stockSummary := request("GET", "/inventory/store-summary?store_id="+district, nil, admin, 200)["data"].(map[string]any)
	found := 0
	for _, raw := range stockSummary["products"].([]any) {
		row := raw.(map[string]any)
		want := map[string]float64{male: 3, female: 10}[row["condom_id"].(string)]
		if want == 0 || row["unit_of_measure_id"] != unit {
			continue
		}
		found++
		if row["dispatched"] != want || row["dispatched_90_days"] != want {
			t.Fatalf("district dispatch summary: %v, want %v dispatched", row, want)
		}
	}
	if found != 2 {
		t.Fatalf("expected both dispatched products, got %d", found)
	}
	ledger := request("GET", "/inventory/movements?store_id="+district+"&reason=hotspot_delivery", nil, admin, 200)["data"].([]any)
	if len(ledger) != 2 {
		t.Fatalf("filtered hotspot delivery ledger: %v", ledger)
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

	// RF04: the manager acknowledges, per line, in pieces actually received; so may the delivery agent
	// named for the delivery, and only for that delivery.
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
	ack(managerToken, map[string]int{"male": 290}, 200)     // a repeated send is counted once
	ack(managerToken, map[string]int{"male": 280}, 409)     // a different count is a correction, not a resend
	ack(riders.awayToken, map[string]int{"female": 0}, 403) // not the agent named for it
	// Nothing female arrived: the delivery agent records the zero count, which keeps the notification
	// partly received.
	expect("female missing", ack(riders.token, map[string]int{"female": 0}, 200), map[string]any{"status": "partly_received"})
	if mine := request("GET", "/orders/deliveries", nil, riders.token, 200)["data"].([]any); mine[0].(map[string]any)["acknowledged"] != true {
		t.Fatalf("the agent's delivery should read as confirmed: %v", mine[0])
	}
	if !hasNotification(t, request, districtToken, "order.delivery_acknowledged", "as confirmed by the delivery agent") {
		t.Fatal("the district was not told the delivery agent confirmed receipt")
	}
	partly := summary(admin, "&category=female")
	expect("summary partly received", partly, map[string]any{"partly_received": float64(1), "notifications_fulfilled": float64(0)})
	expect("female component", partly["component"].(map[string]any), map[string]any{"notifications": float64(1), "fulfilled": float64(0)})
	expect("male component", summary(admin, "&category=male")["component"].(map[string]any), map[string]any{"fulfilled": float64(1)})

	// A second delivery and its acknowledgement complete every selected type.
	second := request("POST", deliveries, map[string]any{"lines": []map[string]any{{"condom_id": female, "quantity": 10}}},
		districtToken, 201)["data"].(map[string]any)
	secondLine := second["deliveries"].([]any)[1].(map[string]any)["lines"].([]any)[0].(map[string]any)["id"].(string)
	// No agent was named for it, so the agent of the first delivery may not acknowledge it.
	request("POST", acknowledgements, map[string]any{"lines": []map[string]any{{"line_id": secondLine, "pieces": 100}}},
		riders.token, 403)
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
	next := stockout(map[string]any{"condom_category": "male", "message": "Out again"}, 201)["data"].(map[string]any)
	if next["id"] == openReport {
		t.Fatal("a stockout after fulfilment reopened the old notification")
	}
	testStockoutRejection(t, pool, request, admin, managerToken, districtToken, otherDistrictToken, hotSpot, male,
		next["id"].(string), stockout, summary, expect)
}

// testStockoutRejection covers a DCFP rejecting a request it will not supply: only before any stock
// goes, with a reason the hotspot is told. A rejected request is closed, so nothing more can be sent
// against it and the hotspot's next report opens a new one. Reports count it as neither fulfilled nor
// pending. reportID is the hotspot's open Male request, with nothing sent yet.
func testStockoutRejection(t *testing.T, pool *pgxpool.Pool, request func(string, string, any, string, int) map[string]any,
	admin, managerToken, districtToken, otherDistrictToken, hotSpot, male, reportID string,
	stockout func(map[string]any, int) map[string]any,
	summary func(string, string) map[string]any,
	expect func(string, map[string]any, map[string]any),
) {
	t.Helper()
	rejection := "/orders/stockouts/" + reportID + "/rejection"
	reason := map[string]any{"reason": "  The district store has no male condoms until NMS delivers  "}
	request("POST", rejection, reason, managerToken, 403)       // no orders:supply_hotspots
	request("POST", rejection, reason, otherDistrictToken, 404) // another district's request
	request("POST", "/orders/stockouts/not-a-uuid/rejection", reason, districtToken, 400)
	request("POST", rejection, map[string]any{}, districtToken, 422)
	request("POST", rejection, map[string]any{"reason": "   "}, districtToken, 422)
	request("POST", rejection, map[string]any{"reason": strings.Repeat("x", 1001)}, districtToken, 422)

	rejected := request("POST", rejection, reason, districtToken, 200)["data"].(map[string]any)
	expect("rejected", rejected, map[string]any{"id": reportID, "status": "rejected", "fulfilled_at": nil,
		"rejection_reason": "The district store has no male condoms until NMS delivers"})
	if rejected["rejected_at"] == nil || rejected["rejected_by"] == nil {
		t.Fatalf("a rejection says when and by whom: %v", rejected)
	}
	events := rejected["events"].([]any)
	last := events[len(events)-1].(map[string]any)
	if last["action"] != "rejected" || last["data"].(map[string]any)["reason"] != rejected["rejection_reason"] {
		t.Fatalf("the rejection is in the request's history: %v", last)
	}
	// Sending the rejection again changes nothing, whatever the reason says.
	again := request("POST", rejection, map[string]any{"reason": "Something else"}, districtToken, 200)["data"].(map[string]any)
	if again["rejection_reason"] != rejected["rejection_reason"] || len(again["events"].([]any)) != len(events) {
		t.Fatalf("a repeated rejection changed the request: %v", again)
	}
	if !hasNotification(t, request, managerToken, "order.stockout_rejected", "no male condoms until NMS delivers") {
		t.Fatal("the hotspot manager was not told why the request was rejected")
	}
	// The hotspot manager reads the rejection on the request's own page.
	expect("manager's view", request("GET", "/orders/stockouts/"+reportID, nil, managerToken, 200)["data"].(map[string]any),
		map[string]any{"status": "rejected", "rejection_reason": rejected["rejection_reason"]})
	request("POST", "/orders/stockouts/"+reportID+"/deliveries",
		map[string]any{"lines": []map[string]any{{"condom_id": male, "quantity": 1}}}, districtToken, 409)

	// Rejected is neither fulfilled nor pending, and the records can be filtered to it.
	withRejection := summary(admin, "")
	expect("summary with a rejection", withRejection, map[string]any{"notifications_raised": float64(2),
		"notifications_fulfilled": float64(1), "notifications_rejected": float64(1), "awaiting_supply": float64(0),
		"fulfilment_rate": float64(50)})
	expect("pending", withRejection["response"].(map[string]any), map[string]any{"pending": float64(0), "oldest_pending_hours": nil})
	expect("late", withRejection["deadline"].(map[string]any), map[string]any{"late_pending": float64(0)})
	records := request("GET", "/reports/notifications/records?status=rejected&hot_spot_id="+hotSpot, nil, districtToken, 200)["data"].([]any)
	if len(records) != 1 || records[0].(map[string]any)["id"] != reportID {
		t.Fatalf("rejected records: %v", records)
	}

	// The next report opens a new request; once stock has gone to it, it can no longer be rejected.
	third := stockout(map[string]any{"condom_category": "male"}, 201)["data"].(map[string]any)
	if third["id"] == reportID || third["status"] != "awaiting_supply" {
		t.Fatalf("a stockout after a rejection should open a new request: %v", third)
	}
	// A delivery without lines stands for stock on its way, and leaves the stock and the HMIS totals
	// that later checks count as they are.
	ctx := context.Background()
	var sent string
	if err := pool.QueryRow(ctx, `INSERT INTO hotspot_deliveries (stockout_report_id, district_store_id, delivered_by_id)
		SELECT $1, district_store_id, delivered_by_id FROM hotspot_deliveries LIMIT 1 RETURNING id`, third["id"]).Scan(&sent); err != nil {
		t.Fatal(err)
	}
	request("POST", "/orders/stockouts/"+third["id"].(string)+"/rejection", map[string]any{"reason": "Too late"}, districtToken, 409)
	if _, err := pool.Exec(ctx, `DELETE FROM hotspot_deliveries WHERE id = $1`, sent); err != nil {
		t.Fatal(err)
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
