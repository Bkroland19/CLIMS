package integration

import (
	"context"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

// testRiders covers the DCFP's rider picker: the active riders at their district store with their open
// deliveries, and dispatch accepting exactly the riders it lists. otherStore is another district store.
func testRiders(t *testing.T, pool *pgxpool.Pool,
	request func(string, string, any, string, int) map[string]any,
	login func(string, string, int) string,
	admin, otherStore, product, unit string,
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

	// A district store of its own, so its riders are exactly the ones made here.
	var store string
	scalar(&store, `WITH district AS (INSERT INTO districts(uid, name, region_id)
			SELECT 'riders-district', 'Riders district', region_id FROM districts WHERE uid = 'test-district' RETURNING id)
		INSERT INTO stores(code, name, store_type, district_id)
		SELECT 'riders-district', 'Riders district store', 'district', id FROM district RETURNING id`)

	roleID := func(role string) string {
		t.Helper()
		var id string
		scalar(&id, `SELECT id FROM roles WHERE name = $1`, role)
		return id
	}
	grant := func(role string, permissions ...string) {
		t.Helper()
		request("PUT", "/roles/"+roleID(role)+"/permissions", map[string]any{"permissions": permissions}, admin, 200)
	}
	grant("dfcp", "orders:read", "orders:process", "orders:replenish", "orders:receive")
	grant("delivery agent", "orders:read", "orders:deliver")
	account := func(role, username, first, last, phone string, store *string) (string, string) {
		t.Helper()
		email := username + "@example.test"
		id := request("POST", "/users", map[string]any{
			"username": username, "email": email, "password": "test-password-123", "first_name": first,
			"last_name": last, "phone_number": phone, "role_ids": []string{roleID(role)}, "store_id": store,
		}, admin, 201)["data"].(map[string]any)["user_id"].(string)
		return id, login(email, "test-password-123", 200)
	}
	_, dcfp := account("dfcp", "riders-dcfp", "Dora", "Akello", "+256781900101", &store)
	_, unassigned := account("dfcp", "riders-unassigned", "Uma", "Atim", "+256781900102", nil)
	busy, riderToken := account("delivery agent", "riders-busy", "Amos", "Okello", "+256781900103", &store)
	free, _ := account("delivery agent", "riders-free", "Betty", "Nakato", "+256781900104", &store)
	disabled, _ := account("delivery agent", "riders-disabled", "Carl", "Obua", "+256781900105", &store)
	request("PATCH", "/users/"+disabled+"/status", map[string]any{"status": "disabled"}, admin, 200)
	elsewhere, _ := account("delivery agent", "riders-elsewhere", "Aaron", "Ojok", "+256781900106", &otherStore)

	// Amos is out on one delivery. His delivered alert, and a dispatched warehouse request carrying his
	// id, don't count. The orders are written directly: the store holds no stock to dispatch.
	var hotSpot, warehouse string
	scalar(&hotSpot, `SELECT id FROM hot_spots ORDER BY id LIMIT 1`)
	scalar(&warehouse, `SELECT id FROM stores WHERE code = 'jms'`)
	shipped := func(status string) string {
		t.Helper()
		var id string
		scalar(&id, `INSERT INTO orders (hot_spot_id, condom_id, unit_of_measure_id, quantity_needed, quantity_issued,
				ordered_by_id, handled_by_id, rider_id, ordered_for_store_id, ordered_from_store_id, order_status)
			VALUES ($1, $2, $3, 10, 10, $4, $4, $4, $5, $5, $6) RETURNING id`,
			hotSpot, product, unit, busy, store, status)
		return id
	}
	out, delivered := shipped("dispatched"), shipped("delivered")
	var shipment, queued string
	scalar(&shipment, `INSERT INTO orders (parent_order_id, condom_id, unit_of_measure_id, quantity_needed, quantity_issued,
			ordered_by_id, handled_by_id, rider_id, ordered_for_store_id, ordered_from_store_id, order_status)
		VALUES ($1, $2, $3, 10, 10, $4, $4, $4, $5, $6, 'dispatched') RETURNING id`,
		delivered, product, unit, busy, store, warehouse)
	// A new alert for the dispatch checks below.
	scalar(&queued, `INSERT INTO orders (hot_spot_id, condom_id, ordered_by_id, ordered_for_store_id,
			ordered_from_store_id, order_status) VALUES ($1, $2, $3, $4, $4, 'queued') RETURNING id`,
		hotSpot, product, busy, store)
	// Later checks total orders and stock, so take these back out.
	defer exec(`DELETE FROM orders WHERE id = ANY($1)`, []string{shipment, out, delivered, queued})

	// The DCFP sees their store's active riders by name, with what each has out; not the disabled
	// rider, a rider at another store, or the DCFP, who doesn't deliver.
	riders := request("GET", "/orders/riders", nil, dcfp, 200)["data"].([]any)
	want := []struct {
		id, first, last, phone string
		open                   float64
	}{{busy, "Amos", "Okello", "+256781900103", 1}, {free, "Betty", "Nakato", "+256781900104", 0}}
	if len(riders) != len(want) {
		t.Fatalf("riders at the store: got %v, want Amos and Betty", riders)
	}
	for i, w := range want {
		r := riders[i].(map[string]any)
		if r["id"] != w.id || r["first_name"] != w.first || r["last_name"] != w.last ||
			r["phone_number"] != w.phone || r["open_deliveries"] != w.open {
			t.Fatalf("rider %d: got %v, want %+v", i, r, w)
		}
		if len(r) != 5 {
			t.Fatalf("rider %d exposes more than the picker needs: %v", i, r)
		}
	}
	request("GET", "/orders/riders?store_id="+store, nil, dcfp, 200)
	request("GET", "/orders/riders?store_id="+otherStore, nil, dcfp, 403)
	request("GET", "/orders/riders?store_id=nope", nil, dcfp, 400)
	request("GET", "/orders/riders", nil, unassigned, 403)
	request("GET", "/orders/riders", nil, riderToken, 403) // A rider lacks orders:process.
	request("GET", "/orders/riders", nil, "", 401)

	// orders:all_stores names the store.
	request("GET", "/orders/riders", nil, admin, 400)
	if other := request("GET", "/orders/riders?store_id="+otherStore, nil, admin, 200)["data"].([]any); !containsID(other, elsewhere) {
		t.Fatalf("admin should see the other store's riders: %v", other)
	}

	// Dispatch takes exactly the listed riders. With an empty store, a listed rider gets as far as the
	// stock check (409); an unlisted one is refused first (422).
	send := func(rider string, want int) {
		t.Helper()
		request("POST", "/orders/"+queued+"/actions/dispatch",
			map[string]any{"rider_id": rider, "unit_of_measure_id": unit, "quantity_issued": 1}, dcfp, want)
	}
	send(disabled, 422)
	send(elsewhere, 422)
	send(free, 409)
}

func containsID(items []any, id string) bool {
	for _, item := range items {
		if item.(map[string]any)["id"] == id {
			return true
		}
	}
	return false
}
