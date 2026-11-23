package integration

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// testStoreAssignment covers the stores lookup, the stores migration 20 filled in for
// legacy accounts, and assigning a store when creating or editing a user. reader is an
// active user without users:update.
func testStoreAssignment(t *testing.T, pool *pgxpool.Pool,
	request func(string, string, any, string, int) map[string]any, admin, reader string,
) {
	t.Helper()
	ctx := context.Background()
	list := func(path, token string) []map[string]any {
		t.Helper()
		items, ok := request("GET", path, nil, token, 200)["data"].([]any)
		if !ok {
			t.Fatalf("GET %s: data is not an array", path)
		}
		rows := make([]map[string]any, 0, len(items))
		for _, item := range items {
			rows = append(rows, item.(map[string]any))
		}
		return rows
	}
	fieldError := func(what string, result map[string]any, field, want string) {
		t.Helper()
		if fields, _ := result["error"].(map[string]any); fields[field] != want {
			t.Errorf("%s: error.%s = %v, want %q", what, field, fields[field], want)
		}
	}
	storeOf := func(userID string) any {
		t.Helper()
		return request("GET", "/users/"+userID, nil, admin, 200)["data"].(map[string]any)["store_id"]
	}

	// Any active user can list stores: both national warehouses first, then district stores.
	stores := list("/locations/stores", reader)
	if len(stores) < 3 || stores[0]["code"] != "jms" || stores[1]["code"] != "nms" ||
		stores[0]["store_type"] != "national" || stores[2]["store_type"] != "district" {
		t.Fatalf("unexpected store order: %v", stores[:min(3, len(stores))])
	}
	jmsID := stores[0]["id"].(string)
	district := stores[2]
	if district["district_id"] == nil || district["district_name"] == nil {
		t.Fatalf("district store without its district: %v", district)
	}
	if national := list("/locations/stores?store_type=national", admin); len(national) != 2 {
		t.Fatalf("national stores: %v", national)
	}
	if one := list("/locations/stores?district_id="+district["district_id"].(string), admin); len(one) != 1 || one[0]["id"] != district["id"] {
		t.Fatalf("stores in one district: %v", one)
	}
	request("GET", "/locations/stores?store_type=warehouse", nil, admin, 400)
	request("GET", "/locations/stores?district_id=nope", nil, admin, 400)
	request("GET", "/locations/stores", nil, "", 401)

	// Legacy warehouse staff, DCFPs and delivery agents with a known district have a store.
	var missing int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM users u
		JOIN role_user ru ON ru.user_id = u.id JOIN roles r ON r.id = ru.role_id
		WHERE u.store_id IS NULL AND (r.name IN ('jms', 'nms')
			OR (r.name IN ('dfcp', 'dcfp', 'delivery agent')
				AND EXISTS (SELECT 1 FROM stores s WHERE s.code = btrim(u.district))))`).Scan(&missing); err != nil {
		t.Fatal(err)
	}
	if missing != 0 {
		t.Fatalf("%d legacy accounts still lack the store their role and district give them", missing)
	}

	// A new account can be given a store; one that does not exist is refused.
	var riderRole string
	if err := pool.QueryRow(ctx, `SELECT id FROM roles WHERE name = 'delivery agent'`).Scan(&riderRole); err != nil {
		t.Fatal(err)
	}
	account := func(name string, storeID string) map[string]any {
		return map[string]any{
			"username": name, "email": name + "@example.test", "password": "test-password-123",
			"role_ids": []string{riderRole}, "store_id": storeID,
		}
	}
	riderID := request("POST", "/users", account("store-rider", district["id"].(string)), admin, 201)["data"].(map[string]any)["user_id"].(string)
	if storeOf(riderID) != district["id"] {
		t.Fatalf("new user's store = %v, want %v", storeOf(riderID), district["id"])
	}
	fieldError("unknown store on create", request("POST", "/users", account("store-ghost", uuid.NewString()), admin, 422),
		"store_id", "Choose an existing store.")

	// Changing and clearing a user's store.
	path := "/users/" + riderID + "/store"
	request("PATCH", path, map[string]any{"store_id": jmsID}, admin, 200)
	if storeOf(riderID) != jmsID {
		t.Fatal("store was not changed")
	}
	request("PATCH", path, map[string]any{"store_id": nil}, admin, 200)
	if storeOf(riderID) != nil {
		t.Fatal("store was not cleared")
	}
	fieldError("missing store_id", request("PATCH", path, map[string]any{}, admin, 422), "store_id", "This field is required.")
	fieldError("malformed store_id", request("PATCH", path, map[string]any{"store_id": "nope"}, admin, 422),
		"store_id", "Choose a valid item from the list.")
	fieldError("unknown store", request("PATCH", path, map[string]any{"store_id": uuid.NewString()}, admin, 422),
		"store_id", "Choose an existing store.")
	request("PATCH", path, map[string]any{"store_id": 5}, admin, 400)
	request("PATCH", "/users/"+uuid.NewString()+"/store", map[string]any{"store_id": jmsID}, admin, 404)
	request("PATCH", path, map[string]any{"store_id": jmsID}, reader, 403)
	testStoreOverview(t, pool, request, admin)
}

func testStoreOverview(t *testing.T, pool *pgxpool.Pool,
	request func(string, string, any, string, int) map[string]any, admin string,
) {
	t.Helper()
	ctx := context.Background()
	var role, store, emptyStore, product, otherProduct, box, piece, brand string
	const newProduct = `INSERT INTO condoms (category, type_id, brand_id, unit_id, pieces_per_unit)
		SELECT 'male', (SELECT id FROM product_types ORDER BY name LIMIT 1),
			(SELECT id FROM brands WHERE name = 'overview brand'),
			(SELECT id FROM unit_of_measures WHERE name = 'overview box'), 100 RETURNING id`
	for _, setup := range []struct {
		query string
		id    *string
	}{
		{`INSERT INTO roles (name) VALUES ('store-overview-reader') RETURNING id`, &role},
		{`INSERT INTO stores (code, name, store_type) VALUES ('overview-test', 'Overview warehouse', 'national') RETURNING id`, &store},
		{`INSERT INTO stores (code, name, store_type) VALUES ('overview-empty', 'Empty warehouse', 'national') RETURNING id`, &emptyStore},
		{`INSERT INTO unit_of_measures (name) VALUES ('overview box') RETURNING id`, &box},
		{`INSERT INTO unit_of_measures (name) VALUES ('overview piece') RETURNING id`, &piece},
		{`INSERT INTO brands (name) VALUES ('overview brand') RETURNING id`, &brand},
		{newProduct, &product},
		{newProduct, &otherProduct},
	} {
		if err := pool.QueryRow(ctx, setup.query).Scan(setup.id); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := pool.Exec(ctx, `INSERT INTO order_store_stock (store_id, condom_id, unit_of_measure_id, on_hand)
		VALUES ($1, $2, $4, 10), ($1, $3, $4, 5), ($1, $2, $5, 100)`, store, product, otherProduct, box, piece); err != nil {
		t.Fatal(err)
	}
	account := map[string]any{"username": "overview-reader", "email": "overview-reader@example.test", "password": "test-password-123", "role_ids": []string{role}}
	id := request("POST", "/users", account, admin, 201)["data"].(map[string]any)["user_id"].(string)
	token := request("POST", "/auth/login", map[string]any{"login": account["email"], "password": account["password"]}, "", 200)["data"].(map[string]any)["token"].(string)
	request("GET", "/stores", nil, "", 401)
	request("GET", "/stores", nil, token, 403)
	request("PUT", "/roles/"+role+"/permissions", map[string]any{"permissions": []string{"inventory:read"}}, admin, 200)
	if rows := request("GET", "/stores", nil, token, 200)["data"].([]any); len(rows) != 0 {
		t.Fatalf("unassigned user saw stores: %v", rows)
	}
	request("PATCH", "/users/"+id+"/store", map[string]any{"store_id": store}, admin, 200)
	rows := request("GET", "/stores", nil, token, 200)["data"].([]any)
	if len(rows) != 1 {
		t.Fatalf("assigned user saw %d stores", len(rows))
	}
	row := rows[0].(map[string]any)
	if row["id"] != store || row["user_count"] != float64(1) {
		t.Fatalf("wrong store or user count: %v", row)
	}
	stock := row["on_hand"].([]any)
	if len(stock) != 2 {
		t.Fatalf("expected two units, got %v", stock)
	}
	for _, raw := range stock {
		line := raw.(map[string]any)
		want := float64(100)
		if line["unit_id"] == box {
			want = 15
		}
		if line["category"] != "male" || line["quantity"] != want {
			t.Fatalf("incorrect stock aggregation: %v", line)
		}
	}
	all := request("GET", "/stores", nil, admin, 200)["data"].([]any)
	foundEmpty := false
	for _, raw := range all {
		row := raw.(map[string]any)
		if row["id"] == emptyStore {
			foundEmpty = true
			if row["user_count"] != float64(0) || len(row["on_hand"].([]any)) != 0 {
				t.Fatalf("empty store: %v", row)
			}
		}
	}
	if !foundEmpty {
		t.Fatal("administrator cannot see the empty store")
	}
}
