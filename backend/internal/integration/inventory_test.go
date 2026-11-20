package integration

import (
	"context"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// testInventoryReports runs after the order workflow: the warehouse received 100 and dispatched 50,
// the district received 55 and dispatched 45 to the hotspot, which received one delivery of 45.
func testInventoryReports(t *testing.T, pool *pgxpool.Pool,
	request func(string, string, any, string, int) map[string]any,
	admin, districtToken, warehouse, district, hotSpot string,
) {
	t.Helper()
	list := func(path, token string) []map[string]any {
		t.Helper()
		var rows []map[string]any
		for _, item := range request("GET", path, nil, token, 200)["data"].([]any) {
			rows = append(rows, item.(map[string]any))
		}
		return rows
	}
	expect := func(what string, row map[string]any, want map[string]float64) {
		t.Helper()
		for field, value := range want {
			if row[field] != value {
				t.Fatalf("%s: %s = %v, want %v (%v)", what, field, row[field], value, row)
			}
		}
	}
	stock := map[string]map[string]any{}
	for _, row := range list("/inventory/stock", admin) {
		stock[row["store_id"].(string)] = row
	}
	expect("warehouse stock", stock[warehouse], map[string]float64{"on_hand": 50, "reserved": 0, "available": 50, "incoming": 0})
	expect("district stock", stock[district], map[string]float64{"on_hand": 10, "available": 10})
	if stock[warehouse]["store_type"] != "national" || stock[district]["district_name"] == nil {
		t.Fatalf("stock rows lack store details: %v", stock)
	}

	// The ledger explains the district balance, newest first.
	moves := list("/inventory/movements?store_id="+district, admin)
	if len(moves) != 2 || moves[0]["reason"] != "dispatch" || moves[1]["reason"] != "order_receipt" || moves[0]["order_id"] == nil {
		t.Fatalf("district movements: %v", moves)
	}
	expect("district dispatch", moves[0], map[string]float64{"quantity": -45, "on_hand_after": 10})
	expect("district receipt", moves[1], map[string]float64{"quantity": 55, "on_hand_after": 55})
	if receipts := list("/inventory/movements?reason=receipt&store_id="+warehouse, admin); len(receipts) != 1 {
		t.Fatalf("warehouse receipt missing: %v", receipts)
	}
	tomorrow := time.Now().AddDate(0, 0, 1).Format(time.DateOnly)
	if later := list("/inventory/movements?from="+tomorrow, admin); len(later) != 0 {
		t.Fatalf("period filter let in %v", later)
	}
	request("GET", "/inventory/movements?from=2026-02-30", nil, admin, 400)

	hotspots := list("/inventory/hotspots?hot_spot_id="+hotSpot, admin)
	if len(hotspots) != 1 || hotspots[0]["last_delivered_at"] == nil {
		t.Fatalf("hotspot stock: %v", hotspots)
	}
	expect("hotspot", hotspots[0], map[string]float64{"delivered": 45, "deliveries": 1, "in_transit": 0, "requested": 0})

	summary := list("/inventory/summary", admin)
	if len(summary) != 1 {
		t.Fatalf("summary: %v", summary)
	}
	expect("summary", summary[0], map[string]float64{"warehouse_on_hand": 50, "district_on_hand": 10,
		"in_transit": 0, "delivered_to_hotspots": 45, "open_hotspot_requests": 0})

	// Adjustments cannot push stock below zero (nothing is reserved) and must say why.
	adjust := func(quantity int, code int) map[string]any {
		t.Helper()
		return request("POST", "/inventory/movements", map[string]any{"store_id": district, "condom_id": stock[district]["condom_id"],
			"unit_of_measure_id": stock[district]["unit_of_measure_id"], "reason": "adjustment", "quantity": quantity,
			"note": "Stock count"}, admin, code)
	}
	adjust(-20, 409)
	expect("adjustment", adjust(-3, 201)["data"].(map[string]any), map[string]float64{"quantity": -3, "on_hand_after": 7})

	// A DCFP sees and adjusts only the district store, and not the national summary.
	var dfcpRole string
	if err := pool.QueryRow(context.Background(), `SELECT id FROM roles WHERE name = 'dfcp'`).Scan(&dfcpRole); err != nil {
		t.Fatal(err)
	}
	request("GET", "/inventory/stock", nil, districtToken, 403)
	request("PUT", "/roles/"+dfcpRole+"/permissions", map[string]any{"permissions": []string{"orders:read", "inventory:read", "inventory:manage"}}, admin, 200)
	if own := list("/inventory/stock", districtToken); len(own) != 1 || own[0]["store_id"] != district {
		t.Fatalf("district user saw other stores: %v", own)
	}
	if own := list("/inventory/hotspots", districtToken); len(own) != 1 {
		t.Fatalf("district user should see its hotspot: %v", own)
	}
	request("GET", "/inventory/summary", nil, districtToken, 403)
	request("POST", "/inventory/movements", map[string]any{"store_id": warehouse, "condom_id": stock[district]["condom_id"],
		"unit_of_measure_id": stock[district]["unit_of_measure_id"], "reason": "receipt", "quantity": 5}, districtToken, 403)
}
