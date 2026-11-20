package integration

import (
	"context"
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
	exec(`INSERT INTO order_hot_spot_routes (hot_spot_id, store_id) VALUES ($1, $2)`, hotSpot, district)
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

	stockout := map[string]any{"hot_spot_id": hotSpot, "condom_id": product, "unit_of_measure_id": unit, "quantity_needed": 50}
	parent := request("POST", "/orders/stockouts", stockout, hotspotToken, 201)["data"].(map[string]any)
	parentPath := "/orders/" + parent["id"].(string)
	notifications := func(token, wantAction string) {
		t.Helper()
		events := request("GET", "/orders/notifications", nil, token, 200)["data"].([]any)
		for _, event := range events {
			if event.(map[string]any)["action"] == wantAction {
				return
			}
		}
		t.Fatalf("notification %s missing: %v", wantAction, events)
	}
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
	notifications(districtToken, "stockout_reported")
	act(parentPath, "review", warehouseToken, nil, 404, "")
	act(parentPath, "review", hotspotToken, nil, 403, "")
	act(parentPath, "dispatch", districtToken, map[string]any{"rider_id": riderID}, 409, "")
	// The district review is automatic: the DCFP checks stock on the queued order directly.
	act(parentPath, "check-stock", districtToken, nil, 200, "on_hold")
	replenish := map[string]any{"warehouse_store_id": warehouse}
	child := act(parentPath, "request-replenishment", districtToken, replenish, 201, "queued")
	if child["parent_order_id"] != parent["id"] {
		t.Fatalf("unlinked replenishment: %v", child)
	}
	childPath := "/orders/" + child["id"].(string)
	act(parentPath, "request-replenishment", districtToken, replenish, 409, "")
	notifications(warehouseToken, "replenishment_requested")
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
	act(childPath, "receive", districtToken, map[string]any{"quantity_received": 55}, 422, "")
	act(childPath, "receive", districtToken, map[string]any{"quantity_received": 55, "quantity_issued": 5}, 422, "")
	receipt := map[string]any{"quantity_received": 55, "discrepancy_note": "Five additional units counted"}
	act(childPath, "receive", districtToken, receipt, 200, "received")
	act(childPath, "receive", districtToken, receipt, 409, "")
	// Receipt reserves the stock for the held order at once and confirms it to the hotspot manager.
	if held := request("GET", parentPath, nil, districtToken, 200)["data"].(map[string]any); held["order_status"] != "confirmed" {
		t.Fatalf("held order not confirmed by receipt: %v", held)
	}
	notifications(hotspotToken, "check-stock")
	act(parentPath, "review", districtToken, nil, 409, "")
	partial := map[string]any{"rider_id": riderID, "quantity_issued": 45}
	dispatched := act(parentPath, "dispatch", districtToken, partial, 200, "dispatched")
	if dispatched["quantity_issued"] != float64(45) {
		t.Fatalf("partial dispatch not recorded: %v", dispatched)
	}
	notifications(riderToken, "dispatch")
	act(parentPath, "deliver", riderToken, map[string]any{"delivery_note": "Received by hotspot manager"}, 200, "delivered")
	notifications(hotspotToken, "deliver")
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
