package integration

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// testBatchExpiry checks batches and expiry (reporting requirements RF10, RF16) after the supply
// reports, when the warehouse holds 20 units of unknown expiry: dated batches are received, expired
// stock cannot be reserved or issued, stock leaves first-expiry-first-out with near-expiry stock needing
// a documented exception, and the district receives the same batches.
func testBatchExpiry(t *testing.T, pool *pgxpool.Pool,
	request func(string, string, any, string, int) map[string]any,
	admin, districtToken, warehouseToken, warehouse, district, product, unit string,
) {
	t.Helper()
	ctx := context.Background()
	kampala := time.FixedZone("EAT", 3*3600)
	today := time.Now().In(kampala)
	day := func(days int) string { return today.AddDate(0, 0, days).Format(time.DateOnly) }
	receive := func(store, batch, expiry string, quantity int) {
		t.Helper()
		request("POST", "/inventory/movements", map[string]any{"store_id": store, "condom_id": product,
			"unit_of_measure_id": unit, "reason": "receipt", "quantity": quantity, "note": "Batch received",
			"batch_number": batch, "expiry_date": expiry}, admin, 201)
	}
	receive(warehouse, "EXP-1", day(-1), 5)
	receive(warehouse, "NEAR-1", day(10), 10)
	receive(warehouse, "LATE-1", day(365), 15)
	request("POST", "/inventory/movements", map[string]any{"store_id": warehouse, "condom_id": product,
		"unit_of_measure_id": unit, "reason": "receipt", "quantity": 1, "expiry_date": "next week"}, admin, 422)

	// The batch report bands each batch by shelf life left; unknown expiry has no band date.
	bands := map[string]string{}
	for _, line := range request("GET", "/reports/batches?store_id="+warehouse, nil, admin, 200)["data"].(map[string]any)["lines"].([]any) {
		l := line.(map[string]any)
		name := "unknown"
		if l["batch_number"] != nil {
			name = l["batch_number"].(string)
		}
		bands[name] = l["band"].(string)
	}
	want := map[string]string{"EXP-1": "expired", "NEAR-1": "under_1_month", "LATE-1": "ok", "unknown": "unknown"}
	for name, band := range want {
		if bands[name] != band {
			t.Fatalf("batch bands: %v, want %v", bands, want)
		}
	}
	if expired := request("GET", "/reports/batches?band=expired&store_id="+warehouse, nil, admin, 200)["data"].(map[string]any)["lines"].([]any); len(expired) != 1 {
		t.Fatalf("expired band filter: %v", expired)
	}
	request("GET", "/reports/batches?band=soon", nil, admin, 400)
	stockLine := func(store string) map[string]any {
		t.Helper()
		for _, line := range request("GET", "/reports/stock?store_id="+store, nil, admin, 200)["data"].(map[string]any)["lines"].([]any) {
			if l := line.(map[string]any); l["condom_id"] == product && l["unit_of_measure_id"] == unit {
				return l
			}
		}
		t.Fatalf("no stock line at %s", store)
		return nil
	}
	expect := func(what string, data map[string]any, want map[string]any) {
		t.Helper()
		for key, value := range want {
			if data[key] != value {
				t.Fatalf("%s: %s = %v, want %v (%v)", what, key, data[key], value, data)
			}
		}
	}
	// 50 physical: 5 expired and 20 of unknown expiry are not usable.
	expect("warehouse stock", stockLine(warehouse), map[string]any{"physical": float64(50), "expired": float64(5),
		"unknown_expiry": float64(20), "usable": float64(25), "batches_reconciled": true})

	// Expired stock cannot be reserved: 45 unexpired units cannot cover 46.
	created := request("POST", "/orders/warehouse-requests", map[string]any{"warehouse_store_id": warehouse,
		"condom_category": categoryOf(t, pool, product), "unit_of_measure_id": unit, "quantity": 46}, districtToken, 201)["data"].(map[string]any)
	orderID := created["id"].(string)
	act := func(action string, body any, code int, status string) map[string]any {
		t.Helper()
		result := request("POST", "/orders/"+orderID+"/actions/"+action, body, warehouseToken, code)
		if code != 200 {
			return result
		}
		data := result["data"].(map[string]any)
		if data["order_status"] != status {
			t.Fatalf("%s: status %v, want %s", action, data["order_status"], status)
		}
		return data
	}
	act("review", map[string]any{"condom_id": product}, 200, "reviewed")
	act("check-stock", nil, 200, "on_hold")
	act("review", map[string]any{"quantity_approved": 40}, 200, "reviewed")
	act("check-stock", nil, 200, "confirmed")

	// First expiry first out: the near-expiry batch goes first, so dispatch needs a documented exception.
	if refused := act("dispatch", nil, 422, ""); refused["error"].(map[string]any)["expiry_exception_reason"] == nil {
		t.Fatalf("near-expiry dispatch without a reason: %v", refused)
	}
	act("receive", map[string]any{"quantity_received": 1}, 403, "") // not the warehouse's step
	act("dispatch", map[string]any{"expiry_exception_reason": "District out of stock; used within the week"}, 200, "dispatched")
	rows, err := pool.Query(ctx, `SELECT coalesce(batch_number, 'unknown'), quantity FROM shipment_batches
		WHERE order_id = $1 ORDER BY expiry_date NULLS LAST, created_at, id`, orderID)
	if err != nil {
		t.Fatal(err)
	}
	var shipped []string
	for rows.Next() {
		var batch string
		var quantity int
		if err := rows.Scan(&batch, &quantity); err != nil {
			t.Fatal(err)
		}
		shipped = append(shipped, fmt.Sprintf("%s:%d", batch, quantity))
	}
	if len(shipped) != 3 || shipped[0] != "NEAR-1:10" || shipped[1] != "LATE-1:15" || shipped[2] != "unknown:15" {
		t.Fatalf("shipped batches (expired skipped, FEFO, unknown last): %v", shipped)
	}
	exceptions := request("GET", "/reports/expiry-exceptions", nil, admin, 200)["data"].([]any)
	if len(exceptions) != 1 {
		t.Fatalf("expiry exceptions: %v", exceptions)
	}
	expect("exception", exceptions[0].(map[string]any), map[string]any{"batch_number": "NEAR-1", "days_remaining": float64(10),
		"quantity": float64(10), "reason": "District out of stock; used within the week",
		"rule_version": "reporting-requirements-0.2-draft", "order_id": orderID})
	if seen := request("GET", "/reports/expiry-exceptions", nil, districtToken, 200)["data"].([]any); len(seen) != 0 {
		t.Fatalf("the district saw the warehouse's exceptions: %v", seen)
	}
	// The expired batch stays behind and is all that blocks further issue.
	expect("warehouse after dispatch", stockLine(warehouse), map[string]any{"physical": float64(10), "expired": float64(5),
		"unknown_expiry": float64(5), "usable": float64(0), "batches_reconciled": true})

	// The district receives the shipped batches; its two-unit shortfall falls on the last line.
	request("POST", "/orders/"+orderID+"/actions/receive", map[string]any{"quantity_received": 38,
		"discrepancy_note": "Two units missing"}, districtToken, 200)
	received := map[string]float64{}
	for _, line := range request("GET", "/reports/batches?store_id="+district, nil, admin, 200)["data"].(map[string]any)["lines"].([]any) {
		l := line.(map[string]any)
		if l["condom_id"] == product && l["batch_number"] != nil {
			received[l["batch_number"].(string)] = l["on_hand"].(float64)
		}
	}
	if received["NEAR-1"] != 10 || received["LATE-1"] != 15 {
		t.Fatalf("district batches: %v", received)
	}
	// A counted correction comes out of the named batch.
	adjust := func(quantity, code int) {
		t.Helper()
		request("POST", "/inventory/movements", map[string]any{"store_id": district, "condom_id": product,
			"unit_of_measure_id": unit, "reason": "adjustment", "quantity": quantity, "note": "Count",
			"batch_number": "LATE-1", "expiry_date": day(365)}, admin, code)
	}
	adjust(-16, 409)
	adjust(-2, 201)
	expect("district after count", stockLine(district), map[string]any{"batches_reconciled": true, "reconciled": true})
}
