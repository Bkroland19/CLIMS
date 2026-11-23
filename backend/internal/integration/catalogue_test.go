package integration

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// testCatalogue covers products, types, brands and units after the legacy import: the converted
// rows, every write rule and each error response. reader is an active user without
// catalogue:manage; the warehouse (sourceID) and district store (destinationID) are used to order a
// catalogue product.
func testCatalogue(t *testing.T, pool *pgxpool.Pool, request func(string, string, any, string, int) map[string]any,
	admin, reader, sourceID, destinationID string,
) {
	t.Helper()
	data := func(result map[string]any) map[string]any {
		t.Helper()
		return result["data"].(map[string]any)
	}
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
	find := func(path, id string) map[string]any {
		t.Helper()
		for _, row := range list(path, admin) {
			if row["id"] == id {
				return row
			}
		}
		t.Fatalf("%s: %s not listed", path, id)
		return nil
	}
	expectFields := func(what string, result map[string]any, want map[string]string) {
		t.Helper()
		fields, _ := result["error"].(map[string]any)
		for field, message := range want {
			if fields[field] != message {
				t.Errorf("%s: error.%s = %v, want %q (%v)", what, field, fields[field], message, result)
			}
		}
	}
	expectMessage := func(what string, result map[string]any, want string) {
		t.Helper()
		if result["message"] != want || result["success"] != false {
			t.Errorf("%s: message = %v, want %q", what, result["message"], want)
		}
	}

	// Anyone signed in can read the catalogue; only catalogue:manage can change it.
	request("GET", "/catalogue/products", nil, "", 401)
	if got := len(list("/catalogue/products", reader)); got != 4 {
		t.Fatalf("legacy products listed: %d, want 4", got)
	}
	list("/catalogue/types", reader)
	list("/catalogue/brands", reader)
	list("/catalogue/units", reader)
	request("POST", "/catalogue/types", map[string]any{"name": "Donated"}, reader, 403)
	request("POST", "/catalogue/brands", map[string]any{"name": "Engabu"}, reader, 403)
	request("PATCH", "/catalogue/products/"+uuid.NewString(), map[string]any{"active": false}, reader, 403)
	request("DELETE", "/catalogue/units/"+uuid.NewString(), nil, reader, 403)
	request("GET", "/catalogue/products?active=maybe", nil, admin, 400)

	// Legacy rows: recognised ones stay active but lack a unit and pack size; the rest were deactivated.
	active := list("/catalogue/products?active=true", admin)
	if len(active) != 2 || len(list("/catalogue/products?active=false", admin)) != 2 {
		t.Fatalf("legacy products: %v", list("/catalogue/products", admin))
	}
	var legacy map[string]any
	for _, product := range active {
		brand, _ := product["brand"].(map[string]any)
		if brand["name"] != "Orange" || product["unit"] != nil || product["pieces_per_unit"] != nil || product["in_use"] != true {
			t.Fatalf("unexpected converted product: %v", product)
		}
		if product["category"] == "female" {
			legacy = product
		}
	}
	legacyType, _ := legacy["type"].(map[string]any)
	if legacy == nil || legacyType["name"] != "Free" {
		t.Fatalf("female legacy product not converted: %v", active)
	}

	// Types: the three distribution channels are seeded and behave like brands.
	typeIDs := map[string]string{}
	for _, productType := range list("/catalogue/types", admin) {
		typeIDs[productType["name"].(string)] = productType["id"].(string)
	}
	freeID, commercialID := typeIDs["Free"], typeIDs["Commercial"]
	if len(typeIDs) != 3 || freeID == "" || commercialID == "" || typeIDs["Socially marketed"] == "" {
		t.Fatalf("seeded types: %v", typeIDs)
	}
	if free := find("/catalogue/types", freeID); free["in_use"] != true || free["product_count"] != float64(1) {
		t.Fatalf("legacy product not counted under its type: %v", free)
	}
	expectMessage("duplicate type", request("POST", "/catalogue/types", map[string]any{"name": "FREE"}, admin, 409),
		"A type with this name already exists.")
	expectFields("short type", request("POST", "/catalogue/types", map[string]any{"name": "x"}, admin, 422),
		map[string]string{"name": "Use at least 2 characters."})
	donated := data(request("POST", "/catalogue/types", map[string]any{"name": " Donated ", "note": "Given by partners"}, admin, 201))
	donatedID := donated["id"].(string)
	if donated["name"] != "Donated" || donated["active"] != true || donated["in_use"] != false {
		t.Fatalf("unexpected new type: %v", donated)
	}
	expectMessage("used type", request("DELETE", "/catalogue/types/"+freeID, nil, admin, 409),
		"This type is used by products. Deactivate it instead.")

	// Brands.
	brand := data(request("POST", "/catalogue/brands", map[string]any{"name": "  Engabu ", "note": " Public sector "}, admin, 201))
	brandID := brand["id"].(string)
	if brand["name"] != "Engabu" || brand["note"] != "Public sector" || brand["active"] != true ||
		brand["in_use"] != false || brand["product_count"] != float64(0) || brand["created_at"] == nil {
		t.Fatalf("unexpected new brand: %v", brand)
	}
	duplicate := request("POST", "/catalogue/brands", map[string]any{"name": "ENGABU"}, admin, 409)
	expectMessage("duplicate brand", duplicate, "A brand with this name already exists.")
	expectFields("duplicate brand", duplicate, map[string]string{"name": "A brand with this name already exists."})
	expectFields("blank brand", request("POST", "/catalogue/brands", map[string]any{"name": "  "}, admin, 422),
		map[string]string{"name": "Enter a name."})
	long := "This brand name is far longer than the sixty characters allowed"
	expectFields("long brand", request("POST", "/catalogue/brands", map[string]any{"name": long}, admin, 422),
		map[string]string{"name": "Use at most 60 characters."})
	request("POST", "/catalogue/brands", map[string]any{"name": "Trust", "colour": "red"}, admin, 400)
	request("PATCH", "/catalogue/brands/"+brandID, map[string]any{}, admin, 400)
	request("PATCH", "/catalogue/brands/not-a-uuid", map[string]any{"active": false}, admin, 400)
	expectMessage("missing brand", request("PATCH", "/catalogue/brands/"+uuid.NewString(),
		map[string]any{"active": false}, admin, 404), "Brand not found.")
	request("PATCH", "/catalogue/brands/"+brandID, map[string]any{"name": "orange"}, admin, 409)
	if cleared := data(request("PATCH", "/catalogue/brands/"+brandID, map[string]any{"note": ""}, admin, 200)); cleared["note"] != nil {
		t.Fatalf("blank note was not cleared: %v", cleared)
	}
	trustID := data(request("POST", "/catalogue/brands", map[string]any{"name": "Trust"}, admin, 201))["id"].(string)

	// Units, including the two legacy ones.
	names := map[string]bool{}
	for _, unit := range list("/catalogue/units", admin) {
		names[unit["name"].(string)] = true
	}
	if !names["box"] || !names["cartons"] {
		t.Fatalf("legacy units missing: %v", names)
	}
	unitID := data(request("POST", "/catalogue/units", map[string]any{"name": "Pack of 3"}, admin, 201))["id"].(string)
	expectFields("short unit", request("POST", "/catalogue/units", map[string]any{"name": "x"}, admin, 422),
		map[string]string{"name": "Use at least 2 characters."})
	expectMessage("duplicate unit", request("POST", "/catalogue/units", map[string]any{"name": "BOX"}, admin, 409),
		"A unit of measure with this name already exists.")

	// Products: every missing or invalid field is reported under its name.
	expectFields("empty product", request("POST", "/catalogue/products", map[string]any{"category": "male"}, admin, 422),
		map[string]string{
			"type_id": "Choose a type.", "brand_id": "Choose a brand.", "unit_id": "Choose a unit of measure.",
			"pieces_per_unit": "Enter how many condoms one unit holds.",
		})
	valid := func(changes map[string]any) map[string]any {
		body := map[string]any{"category": "male", "type_id": freeID, "brand_id": brandID, "unit_id": unitID, "pieces_per_unit": 3}
		for field, value := range changes {
			body[field] = value
		}
		return body
	}
	expectFields("invalid product", request("POST", "/catalogue/products",
		valid(map[string]any{"category": "unisex", "type_id": "donated", "pieces_per_unit": 100001, "unit_id": "box"}), admin, 422),
		map[string]string{
			"category": "Choose male or female.", "type_id": "Choose a type from the list.",
			"pieces_per_unit": "Must be at most 100,000.", "unit_id": "Choose a unit of measure from the list.",
		})
	expectFields("unknown brand", request("POST", "/catalogue/products",
		valid(map[string]any{"brand_id": uuid.NewString()}), admin, 422), map[string]string{"brand_id": "Choose an existing brand."})
	product := data(request("POST", "/catalogue/products", valid(map[string]any{"category": " Male "}), admin, 201))
	productID := product["id"].(string)
	productType, _ := product["type"].(map[string]any)
	productBrand, _ := product["brand"].(map[string]any)
	productUnit, _ := product["unit"].(map[string]any)
	if product["category"] != "male" || productType["name"] != "Free" || productBrand["name"] != "Engabu" || productUnit["name"] != "Pack of 3" ||
		product["pieces_per_unit"] != float64(3) || product["active"] != true || product["in_use"] != false {
		t.Fatalf("unexpected new product: %v", product)
	}
	if counted := find("/catalogue/brands", brandID); counted["product_count"] != float64(1) || counted["in_use"] != true {
		t.Fatalf("brand usage not counted: %v", counted)
	}

	// An inactive brand cannot be newly chosen, but a product that already has it stays editable.
	request("PATCH", "/catalogue/brands/"+trustID, map[string]any{"active": false}, admin, 200)
	expectFields("inactive brand", request("PATCH", "/catalogue/products/"+productID,
		map[string]any{"brand_id": trustID}, admin, 422),
		map[string]string{"brand_id": "This brand is inactive. Choose an active brand."})
	request("PATCH", "/catalogue/brands/"+brandID, map[string]any{"active": false}, admin, 200)
	if edited := data(request("PATCH", "/catalogue/products/"+productID, valid(map[string]any{"pieces_per_unit": 12}), admin, 200)); edited["pieces_per_unit"] != float64(12) {
		t.Fatalf("edit with an existing inactive brand failed: %v", edited)
	}
	request("PATCH", "/catalogue/brands/"+brandID, map[string]any{"active": true}, admin, 200)
	if find("/catalogue/products", productID)["active"] != true {
		t.Fatal("deactivating a brand changed its products")
	}

	// Types follow the same rules: an inactive one cannot be newly chosen.
	request("PATCH", "/catalogue/types/"+donatedID, map[string]any{"active": false}, admin, 200)
	expectFields("inactive type", request("PATCH", "/catalogue/products/"+productID,
		map[string]any{"type_id": donatedID}, admin, 422),
		map[string]string{"type_id": "This type is inactive. Choose an active type."})
	expectFields("unknown type", request("PATCH", "/catalogue/products/"+productID,
		map[string]any{"type_id": uuid.NewString()}, admin, 422), map[string]string{"type_id": "Choose an existing type."})
	retyped := data(request("PATCH", "/catalogue/products/"+productID, map[string]any{"type_id": commercialID}, admin, 200))
	if retypedType, _ := retyped["type"].(map[string]any); retypedType["name"] != "Commercial" {
		t.Fatalf("type not changed: %v", retyped)
	}
	request("PATCH", "/catalogue/products/"+productID, map[string]any{"type_id": freeID}, admin, 200)
	request("DELETE", "/catalogue/types/"+donatedID, nil, admin, 200)
	request("DELETE", "/catalogue/types/"+donatedID, nil, admin, 404)

	// Incomplete legacy products can be deactivated, but activating or editing one needs every field.
	legacyPath := "/catalogue/products/" + legacy["id"].(string)
	request("PATCH", legacyPath, map[string]any{"active": false}, admin, 200)
	expectFields("activate incomplete", request("PATCH", legacyPath, map[string]any{"active": true}, admin, 422),
		map[string]string{"unit_id": "Choose a unit of measure.", "pieces_per_unit": "Enter how many condoms one unit holds."})
	request("PATCH", legacyPath, map[string]any{"type_id": commercialID}, admin, 422)
	completed := data(request("PATCH", legacyPath, map[string]any{"unit_id": unitID, "pieces_per_unit": 144, "active": true}, admin, 200))
	if completedType, _ := completed["type"].(map[string]any); completed["active"] != true ||
		completed["pieces_per_unit"] != float64(144) || completedType["name"] != "Free" {
		t.Fatalf("legacy product not completed: %v", completed)
	}

	// Inactive products cannot be ordered: the warehouse cannot choose one at review. Ordered products
	// cannot be deleted. The administrator orders for the district store, as a DCFP would, and
	// reviews the order as the warehouse.
	assign := func(store any) {
		t.Helper()
		if _, err := pool.Exec(context.Background(), `UPDATE users SET store_id = $1 WHERE email = 'admin@example.test'`,
			store); err != nil {
			t.Fatal(err)
		}
	}
	assign(destinationID)
	defer assign(nil)
	placed := data(request("POST", "/orders/warehouse-requests", map[string]any{"warehouse_store_id": sourceID,
		"condom_category": categoryOf(t, pool, productID), "quantity": 10}, admin, 201))
	review := "/orders/" + placed["id"].(string) + "/actions/review"
	request("PATCH", "/catalogue/products/"+productID, map[string]any{"active": false}, admin, 200)
	expectFields("order inactive product", request("POST", review, map[string]any{"condom_id": productID}, admin, 422),
		map[string]string{"condom_id": "This product is inactive and cannot be ordered."})
	request("PATCH", "/catalogue/products/"+productID, map[string]any{"active": true}, admin, 200)
	request("POST", review, map[string]any{"condom_id": productID}, admin, 200)
	if find("/catalogue/products", productID)["in_use"] != true {
		t.Fatal("ordered product is not in use")
	}
	expectMessage("delete ordered product", request("DELETE", "/catalogue/products/"+productID, nil, admin, 409),
		"This product is used by stock or order records. Deactivate it instead.")
	expectMessage("delete legacy product", request("DELETE", legacyPath, nil, admin, 409),
		"This product is used by stock or order records. Deactivate it instead.")
	expectMessage("delete used brand", request("DELETE", "/catalogue/brands/"+brandID, nil, admin, 409),
		"This brand is used by products. Deactivate it instead.")
	expectMessage("delete used unit", request("DELETE", "/catalogue/units/"+unitID, nil, admin, 409),
		"This unit of measure is used by products, stock or orders. Deactivate it instead.")

	// Unused records can be deleted, once.
	spareID := data(request("POST", "/catalogue/products", valid(nil), admin, 201))["id"].(string)
	if deleted := request("DELETE", "/catalogue/products/"+spareID, nil, admin, 200); deleted["success"] != true {
		t.Fatalf("delete product: %v", deleted)
	}
	expectMessage("deleted product", request("DELETE", "/catalogue/products/"+spareID, nil, admin, 404), "Product not found.")
	request("DELETE", "/catalogue/brands/"+trustID, nil, admin, 200)
	request("DELETE", "/catalogue/brands/"+trustID, nil, admin, 404)

	// An empty filter result is still an array.
	if inactiveBrands := list("/catalogue/brands?active=false", admin); len(inactiveBrands) != 0 {
		t.Fatalf("unexpected inactive brands: %v", inactiveBrands)
	}
}
