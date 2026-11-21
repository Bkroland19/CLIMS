package integration

import (
	"context"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

func testOrderWorkflow(t *testing.T, pool *pgxpool.Pool,
	request func(string, string, any, string, int) map[string]any,
	login func(string, string, int) string,
	admin, warehouse, district, product, unit string,
) {
	t.Helper()
	ctx := context.Background()
	exec := func(sql string, args ...any) {
		t.Helper()
		if _, err := pool.Exec(ctx, sql, args...); err != nil {
			t.Fatal(err)
		}
	}
	var hotSpot string
	if err := pool.QueryRow(ctx, `SELECT id FROM hot_spots ORDER BY id LIMIT 1`).Scan(&hotSpot); err != nil {
		t.Fatal(err)
	}
	// Alerts go to the store of the hotspot's district.
	exec(`UPDATE hot_spots SET district_id = (SELECT district_id FROM stores WHERE id = $2) WHERE id = $1`, hotSpot, district)
	account := func(role, name string, store, hotspot *string, permissions ...string) (string, string) {
		t.Helper()
		var roleID string
		if err := pool.QueryRow(ctx, `SELECT id FROM roles WHERE name = $1`, role).Scan(&roleID); err != nil {
			t.Fatal(err)
		}
		request("PUT", "/roles/"+roleID+"/permissions",
			map[string]any{"permissions": append([]string{"orders:read"}, permissions...)}, admin, 200)
		email := name + "@example.test"
		profile := request("POST", "/users", map[string]any{
			"username": name, "email": email, "password": "test-password-123", "role_ids": []string{roleID},
		}, admin, 201)["data"].(map[string]any)
		id := profile["user_id"].(string)
		exec(`UPDATE users SET store_id = $2, hot_spot_id = $3 WHERE id = $1`, id, store, hotspot)
		return id, login(email, "test-password-123", 200)
	}
	_, hotspotToken := account("hotspot manager", "workflow-hotspot", nil, &hotSpot, "orders:stockout")
	_, districtToken := account("dfcp", "workflow-district", &district, nil, "orders:process", "orders:replenish", "orders:receive")
	_, warehouseToken := account("jms", "workflow-warehouse", &warehouse, nil, "orders:process")
	riderID, riderToken := account("delivery agent", "workflow-rider", &district, nil, "orders:deliver")

	// The hotspot manager raises an alert naming the product only; quantities are the DCFP's decision.
	request("POST", "/orders/stockouts", map[string]any{"hot_spot_id": hotSpot, "condom_id": product, "quantity_needed": 50}, hotspotToken, 400)
	stockout := map[string]any{"hot_spot_id": hotSpot, "condom_id": product, "comment": "Dispenser empty since Monday"}
	parent := request("POST", "/orders/stockouts", stockout, hotspotToken, 201)["data"].(map[string]any)
	if parent["order_status"] != "queued" || parent["quantity_needed"] != nil || parent["unit_of_measure_id"] != nil {
		t.Fatalf("stockout alert should carry no quantity: %v", parent)
	}
	parentPath := "/orders/" + parent["id"].(string)
	// inbox returns the central-inbox notification of this type about the order, if any.
	inbox := func(token, orderID, typeName string) map[string]any {
		t.Helper()
		for _, item := range request("GET", "/notifications?limit=100", nil, token, 200)["data"].([]any) {
			n := item.(map[string]any)
			if n["resource_type"] == "order" && n["resource_id"] == orderID && n["type"] == typeName {
				return n
			}
		}
		return nil
	}
	notified := func(token, orderID, typeName string) {
		t.Helper()
		if inbox(token, orderID, typeName) == nil {
			t.Fatalf("notification %s about order %s missing", typeName, orderID)
		}
	}
	parentID := parent["id"].(string)
	act := func(order, name, token string, input any, code int, state string) map[string]any {
		t.Helper()
		result := request("POST", order+"/actions/"+name, input, token, code)
		if code >= 400 {
			return nil
		}
		data := result["data"].(map[string]any)
		if data["order_status"] != state {
			t.Fatalf("%s: expected %s, got %v", name, state, data)
		}
		return data
	}
	notified(districtToken, parentID, "order.stockout_reported")
	// Riders share the district store but do not process alerts.
	if inbox(riderToken, parentID, "order.stockout_reported") != nil {
		t.Fatal("the rider was alerted to a stockout")
	}
	deprecated := false // The orders inbox keeps working until clients use the central one.
	for _, event := range request("GET", "/orders/notifications", nil, districtToken, 200)["data"].([]any) {
		e := event.(map[string]any)
		deprecated = deprecated || e["order_id"] == parentID && e["action"] == "stockout_reported"
	}
	if !deprecated {
		t.Fatal("the deprecated orders inbox stopped receiving stockouts")
	}
	if parent["ordered_from_store_id"] != district {
		t.Fatalf("alert should go to the hotspot's district store: %v", parent)
	}
	// Only the hotspot's district is notified, not other districts' DCFPs.
	var otherStore, noDistrictHotSpot string
	if err := pool.QueryRow(ctx, `SELECT s.id FROM stores s WHERE s.store_type = 'district' AND s.id <> $1 LIMIT 1`, district).Scan(&otherStore); err != nil {
		t.Fatal(err)
	}
	_, otherToken := account("dfcp", "workflow-other-district", &otherStore, nil, "orders:process", "orders:replenish", "orders:receive")
	if inbox(otherToken, parentID, "order.stockout_reported") != nil {
		t.Fatal("another district's DCFP was notified of the alert")
	}
	act(parentPath, "dispatch", otherToken, map[string]any{"rider_id": riderID, "unit_of_measure_id": unit, "quantity_issued": 1}, 404, "")
	// A hotspot without a district cannot route an alert.
	if err := pool.QueryRow(ctx, `SELECT id FROM hot_spots WHERE district_id IS NULL LIMIT 1`).Scan(&noDistrictHotSpot); err != nil {
		t.Fatal(err)
	}
	if message := request("POST", "/orders/stockouts", map[string]any{"hot_spot_id": noDistrictHotSpot, "condom_id": product},
		admin, 422)["message"]; message != "hotspot has no district with a store; set the hotspot's district" {
		t.Fatalf("hotspot without a district: %v", message)
	}
	act(parentPath, "review", warehouseToken, nil, 404, "")
	act(parentPath, "review", hotspotToken, nil, 403, "")
	// An alert has nothing to review or check; the DCFP sends stock or asks the warehouse.
	act(parentPath, "review", districtToken, nil, 409, "")
	act(parentPath, "check-stock", districtToken, nil, 409, "")
	send := func(quantity int) map[string]any {
		return map[string]any{"rider_id": riderID, "unit_of_measure_id": unit, "quantity_issued": quantity}
	}
	act(parentPath, "dispatch", districtToken, map[string]any{"rider_id": riderID, "quantity_issued": 45}, 422, "")
	if message := request("POST", parentPath+"/actions/dispatch", send(45), districtToken, 409)["message"]; message !=
		"not enough available stock at the district store; request it from the warehouse" {
		t.Fatalf("empty district store: %v", message)
	}
	act(parentPath, "request-replenishment", districtToken, map[string]any{"warehouse_store_id": warehouse}, 422, "")
	replenish := map[string]any{"warehouse_store_id": warehouse, "unit_of_measure_id": unit, "quantity": 50}
	child := act(parentPath, "request-replenishment", districtToken, replenish, 201, "queued")
	if child["parent_order_id"] != parent["id"] || child["quantity_needed"] != float64(50) || child["unit_of_measure_id"] != unit {
		t.Fatalf("replenishment should carry the DCFP's quantity: %v", child)
	}
	if held := request("GET", parentPath, nil, districtToken, 200)["data"].(map[string]any); held["order_status"] != "on_hold" {
		t.Fatalf("alert should wait on hold for the warehouse: %v", held)
	}
	childPath := "/orders/" + child["id"].(string)
	act(parentPath, "request-replenishment", districtToken, replenish, 409, "")
	childID := child["id"].(string)
	if replenishment := inbox(warehouseToken, childID, "order.replenishment_requested"); replenishment == nil ||
		!strings.Contains(replenishment["body"].(string), "requested 50 ") {
		t.Fatalf("replenishment notification: %v", replenishment)
	}
	// The warehouse reviews a request before checking stock, and rechecks a held request directly.
	act(childPath, "check-stock", warehouseToken, nil, 409, "")
	act(childPath, "review", warehouseToken, nil, 200, "reviewed")
	act(childPath, "check-stock", warehouseToken, nil, 200, "on_hold")
	// Warehouse stock arrives through the inventory API, so the ledger accounts for every unit.
	request("POST", "/inventory/movements", map[string]any{"store_id": warehouse, "condom_id": product,
		"unit_of_measure_id": unit, "reason": "receipt", "quantity": 100, "note": "Delivery from supplier"}, admin, 201)
	act(childPath, "check-stock", warehouseToken, nil, 200, "confirmed")
	act(childPath, "dispatch", warehouseToken, map[string]any{"quantity_issued": 51}, 422, "")
	act(childPath, "dispatch", warehouseToken, map[string]any{"quantity_issued": 0}, 422, "")
	act(childPath, "dispatch", warehouseToken, nil, 200, "dispatched")
	notified(districtToken, childID, "order.shipment_dispatched")
	// The receipt notifies the district's other processors, not the DCFP who records it.
	_, colleagueToken := account("dfcp", "workflow-district-colleague", &district, nil, "orders:process", "orders:replenish", "orders:receive")
	act(childPath, "receive", districtToken, map[string]any{"quantity_received": 55}, 422, "")
	act(childPath, "receive", districtToken, map[string]any{"quantity_received": 55, "quantity_issued": 5}, 422, "")
	receipt := map[string]any{"quantity_received": 55, "discrepancy_note": "Five additional units counted"}
	act(childPath, "receive", districtToken, receipt, 200, "received")
	act(childPath, "receive", districtToken, receipt, 409, "")
	// With the stock in, the alert still waits for the DCFP, who sends what the hotspot needs.
	notified(colleagueToken, childID, "order.shipment_received")
	if inbox(districtToken, childID, "order.shipment_received") != nil {
		t.Fatal("the DCFP who recorded the receipt was notified of it")
	}
	if held := request("GET", parentPath, nil, districtToken, 200)["data"].(map[string]any); held["order_status"] != "on_hold" {
		t.Fatalf("receipt should leave the alert to the DCFP: %v", held)
	}
	act(parentPath, "dispatch", districtToken, send(56), 409, "")
	dispatched := act(parentPath, "dispatch", districtToken, send(45), 200, "dispatched")
	if dispatched["quantity_issued"] != float64(45) || dispatched["quantity_needed"] != float64(45) ||
		dispatched["unit_of_measure_id"] != unit || dispatched["rider_id"] != riderID {
		t.Fatalf("dispatch should record the DCFP's unit and quantity: %v", dispatched)
	}
	if assignment := inbox(riderToken, parentID, "order.delivery_assigned"); assignment == nil ||
		!strings.HasPrefix(assignment["body"].(string), "Deliver 45 ") {
		t.Fatalf("delivery assignment: %v", assignment)
	}
	act(parentPath, "deliver", riderToken, map[string]any{"delivery_note": "Received by hotspot manager"}, 200, "delivered")
	notified(hotspotToken, parentID, "order.delivered")
	request("GET", parentPath+"/events", nil, hotspotToken, 200)
	balance := func(store string, wantOnHand int) {
		t.Helper()
		var onHand, reserved int
		if err := pool.QueryRow(ctx, `SELECT on_hand, reserved FROM order_store_stock
			WHERE store_id = $1 AND condom_id = $2 AND unit_of_measure_id = $3`, store, product, unit).Scan(&onHand, &reserved); err != nil {
			t.Fatal(err)
		}
		if onHand != wantOnHand || reserved != 0 {
			t.Fatalf("store %s balance on hand=%d reserved=%d, want %d and 0", store, onHand, reserved, wantOnHand)
		}
	}
	balance(district, 10) // 55 received, 45 issued
	balance(warehouse, 50)
	testInventoryReports(t, pool, request, admin, districtToken, warehouse, district, hotSpot)
}
