package integration

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http/httptest"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"clims-backend/internal/database"
	"clims-backend/internal/features/auth"
	"clims-backend/internal/features/hotspots"
	"clims-backend/internal/features/inventory"
	"clims-backend/internal/features/locations"
	"clims-backend/internal/features/orders"
	"clims-backend/internal/features/rbac"
	"clims-backend/internal/features/users"
	"clims-backend/internal/middleware"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

func TestAuthRBACIntegration(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set TEST_DATABASE_URL to a PostgreSQL instance with CREATE DATABASE permission")
	}
	ctx := context.Background()
	admin, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(admin.Close)
	name := fmt.Sprintf("clims_auth_test_%d", time.Now().UnixNano())
	if _, err = admin.Exec(ctx, `CREATE DATABASE `+name); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if _, err := admin.Exec(ctx, `DROP DATABASE `+name+` WITH (FORCE)`); err != nil {
			t.Error(err)
		}
	})
	u, err := url.Parse(dsn)
	if err != nil {
		t.Fatal(err)
	}
	u.Path = "/" + name
	pool, err := pgxpool.New(ctx, u.String())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	if err = database.RunMigrations(u.String()); err != nil {
		t.Fatal(err)
	}
	if err = database.RunMigrations(u.String()); err != nil {
		t.Fatal(err)
	}

	// Fresh migrated installations must still accept the complete legacy backup.
	seed, err := os.ReadFile(filepath.Join("..", "..", "..", "infra", "database", "clims_postgres_seed.sql"))
	if err != nil {
		t.Fatal(err)
	}
	uuidSeed, err := exec.Command("python3", filepath.Join("..", "..", "..", "scripts", "prepare_legacy_seed.py")).Output()
	if err != nil {
		t.Fatal(err)
	}
	if _, err = pool.Exec(ctx, string(uuidSeed)); err != nil {
		t.Fatal(err)
	}
	var nonUUIDKeys int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM pg_constraint c
		JOIN pg_class t ON t.oid=c.conrelid
		JOIN pg_namespace n ON n.oid=t.relnamespace
		JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=ANY(c.conkey)
		WHERE n.nspname='public' AND t.relname <> 'schema_migrations'
		AND c.contype='p' AND a.atttypid <> 'uuid'::regtype`).Scan(&nonUUIDKeys); err != nil {
		t.Fatal(err)
	}
	if nonUUIDKeys != 0 {
		t.Fatalf("found %d non-UUID application primary-key columns", nonUUIDKeys)
	}
	var roleCount, userCount int
	if err = pool.QueryRow(ctx, `SELECT (SELECT count(*) FROM roles),(SELECT count(*) FROM users)`).Scan(&roleCount, &userCount); err != nil {
		t.Fatal(err)
	}
	if roleCount != 12 || userCount != 455 {
		t.Fatalf("legacy import: roles=%d users=%d", roleCount, userCount)
	}
	// Importing after migrations resolves the backup's shared usernames and phone numbers.
	assertUniqueIdentifiers(t, pool)
	repo := users.NewRepository(pool)
	var legacyAdminID string
	if err = pool.QueryRow(ctx, `SELECT ru.user_id FROM role_user ru JOIN roles r ON r.id=ru.role_id WHERE r.name='admin' LIMIT 1`).Scan(&legacyAdminID); err != nil {
		t.Fatal(err)
	}
	legacyAdmin, err := repo.GetUserByID(ctx, legacyAdminID)
	if err != nil {
		t.Fatal(err)
	}
	if legacyAdmin.Role == nil || legacyAdmin.Role.Name != "admin" || !legacyAdmin.HasPermission("orders:all_stores") {
		t.Fatal("legacy admin role not resolved")
	}
	// Keep the access tests independent of real legacy account credentials.
	if _, err = pool.Exec(ctx, `DELETE FROM users USING role_user ru, roles r WHERE users.id=ru.user_id AND r.id=ru.role_id AND r.name='admin'`); err != nil {
		t.Fatal(err)
	}
	roleIDs := map[string]string{}
	for _, name := range []string{"admin", "moh", "hotspot manager"} {
		var roleID string
		if err := pool.QueryRow(ctx, `SELECT id FROM roles WHERE name=$1`, name).Scan(&roleID); err != nil {
			t.Fatal(err)
		}
		roleIDs[name] = roleID
	}
	adminRole, mohRole, hotspotRole := roleIDs["admin"], roleIDs["moh"], roleIDs["hotspot manager"]
	unknownID := uuid.NewString()
	hash, err := bcrypt.GenerateFromPassword([]byte("test-password-123"), bcrypt.MinCost)
	if err != nil {
		t.Fatal(err)
	}
	adminID, err := repo.CreateUser(ctx, users.AccountInput{Username: "test-admin", Email: "admin@example.test"}, string(hash), adminRole)
	if err != nil {
		t.Fatal(err)
	}
	app := fiber.New()
	v1 := app.Group("/api/v1")
	service := users.NewService(repo)
	roleRepo := rbac.NewRepository(pool)
	jwtMiddleware := middleware.NewJWTMiddleware("test-secret")
	activeUser := users.ActiveUser(repo)
	auth.RegisterRoutes(v1, auth.NewHandler(repo, service, "test-secret"), jwtMiddleware, activeUser)
	users.RegisterRoutes(v1, users.NewHandler(repo, service), jwtMiddleware, activeUser)
	rbac.RegisterRoutes(v1, rbac.NewHandler(roleRepo), jwtMiddleware, activeUser)
	orders.RegisterRoutes(v1, orders.NewRepository(pool), jwtMiddleware, activeUser)
	hotspots.RegisterRoutes(v1, hotspots.NewRepository(pool), jwtMiddleware, activeUser)
	inventory.RegisterRoutes(v1, inventory.NewRepository(pool), jwtMiddleware, activeUser)
	locations.RegisterRoutes(v1, locations.NewHandler(pool), jwtMiddleware, activeUser)

	request := func(method, path string, body any, token string, want int) map[string]any {
		t.Helper()
		var data []byte
		if body != nil {
			var err error
			data, err = json.Marshal(body)
			if err != nil {
				t.Fatal(err)
			}
		}
		req := httptest.NewRequest(method, "/api/v1"+path, bytes.NewReader(data))
		req.Header.Set("Content-Type", "application/json")
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		res, err := app.Test(req)
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()
		payload, err := io.ReadAll(res.Body)
		if err != nil {
			t.Fatal(err)
		}
		if res.StatusCode != want {
			t.Fatalf("%s %s: got %d want %d: %s", method, path, res.StatusCode, want, payload)
		}
		if bytes.Contains(payload, []byte("password")) && want < 400 {
			t.Fatal("response exposed a password field")
		}
		var result map[string]any
		if err = json.Unmarshal(payload, &result); err != nil {
			t.Fatal(err)
		}
		return result
	}
	login := func(email, password string, want int) string {
		result := request("POST", "/auth/login", map[string]any{"email": email, "password": password}, "", want)
		if want != 200 {
			return ""
		}
		return result["data"].(map[string]any)["token"].(string)
	}
	adminToken := login(" ADMIN@example.test ", "test-password-123", 200)
	request("GET", "/users", nil, "", 401)
	request("GET", "/roles", nil, adminToken, 200)
	request("GET", "/permissions", nil, adminToken, 200)

	var facilityID, hotSpotID string
	if err = pool.QueryRow(ctx, `SELECT (SELECT id FROM organization_units LIMIT 1), (SELECT id FROM hot_spots LIMIT 1)`).Scan(&facilityID, &hotSpotID); err != nil {
		t.Fatal(err)
	}
	account := map[string]any{
		"username": "assigned-user", "email": "assigned@example.test", "password": "test-password-123",
		"role_id": hotspotRole, "organisation_unit_id": unknownID, "hot_spot_id": hotSpotID,
	}
	request("POST", "/users", account, adminToken, 422)
	account["organisation_unit_id"] = facilityID
	request("POST", "/users", account, adminToken, 201)
	assignedToken := login("assigned@example.test", "test-password-123", 200)
	assignedProfile := request("GET", "/auth/me", nil, assignedToken, 200)["data"].(map[string]any)
	if assignedProfile["organisation_unit_id"] != facilityID || assignedProfile["hot_spot_id"] != hotSpotID {
		t.Fatalf("account assignment did not round-trip: %v", assignedProfile)
	}

	registration := map[string]any{"username": "newuser", "email": " NewUser@example.test ", "password": "test-password-123", "first_name": "New", "lastname": "User", "location": "Kampala"}
	for _, field := range []string{"role_id", "role_ids", "role", "status", "organisation_unit_id", "hot_spot_id", "remember_token"} {
		bad := map[string]any{"username": "bad", "email": "bad@example.test", "password": "test-password-123", field: 1}
		request("POST", "/auth/register", bad, "", 400)
	}
	id := request("POST", "/auth/register", registration, "", 201)["data"].(map[string]any)["user_id"].(string)
	if _, err := uuid.Parse(id); err != nil {
		t.Fatal("registration did not return a UUID")
	}
	request("POST", "/auth/register", registration, "", 409)
	request("POST", "/auth/register", map[string]any{"username": "longpass", "email": "long@example.test", "password": strings.Repeat("é", 40)}, "", 422)
	login("newuser@example.test", "incorrect", 401)
	// Laravel/MySQL bcrypt hashes use the $2y$ prefix.
	if _, err = pool.Exec(ctx, `UPDATE users SET password=replace(password,'$2a$','$2y$') WHERE id=$1`, id); err != nil {
		t.Fatal(err)
	}
	userToken := login("newuser@example.test", "test-password-123", 200)
	me := request("GET", "/auth/me", nil, userToken, 200)["data"].(map[string]any)
	loginData := request("POST", "/auth/login", map[string]any{"email": "newuser@example.test", "password": "test-password-123"}, "", 200)["data"].(map[string]any)
	for _, profile := range []map[string]any{me, loginData["user"].(map[string]any)} {
		if profile["first_name"] != "New" || profile["last_name"] != "User" || profile["location"] != "Kampala" ||
			profile["created_at"] == nil || profile["updated_at"] == nil {
			t.Fatalf("profile fields did not round-trip: %v", profile)
		}
		if _, present := profile["remember_token"]; present {
			t.Fatal("profile exposed a remember token")
		}
		roles := profile["roles"].([]any)
		if len(roles) != 1 {
			t.Fatalf("expected one registration role, got %v", roles)
		}
		role := roles[0].(map[string]any)
		if role["id"] != rbac.RegisteredUserRoleID || role["name"] != "registered user" || len(role["permissions"].([]any)) != 0 {
			t.Fatalf("unexpected registration role: %v", role)
		}
	}
	request("GET", "/users", nil, userToken, 403)
	request("PATCH", fmt.Sprintf("/users/%s/role", id), map[string]any{"role_id": adminRole}, userToken, 403)
	request("PATCH", fmt.Sprintf("/users/%s/role", id), map[string]any{"role_id": unknownID}, adminToken, 404)
	request("PATCH", fmt.Sprintf("/users/%s/role", id), map[string]any{"role_id": hotspotRole}, adminToken, 200)
	me = request("GET", "/auth/me", nil, userToken, 200)["data"].(map[string]any)
	if me["role"].(map[string]any)["name"] != "hotspot manager" {
		t.Fatal("legacy role name changed")
	}
	request("PUT", "/roles/"+hotspotRole+"/permissions", map[string]any{"permissions": []string{"users:read"}}, adminToken, 200)
	request("GET", "/users?limit=1", nil, userToken, 200)
	request("POST", "/users", map[string]any{}, userToken, 403)
	request("PUT", "/roles/"+hotspotRole+"/permissions", map[string]any{"permissions": []string{"unknown:permission"}}, adminToken, 422)
	request("GET", "/users", nil, userToken, 200) // Invalid update rolled back.
	request("PUT", "/roles/"+hotspotRole+"/permissions", map[string]any{"permissions": []string{}}, adminToken, 200)
	request("GET", "/users", nil, userToken, 403) // Existing JWT loses access immediately.
	request("PUT", "/roles/"+hotspotRole+"/permissions", map[string]any{"permissions": []string{"users:create"}}, adminToken, 200)
	request("POST", "/users", map[string]any{"username": "escalation", "email": "escalation@example.test", "password": "test-password-123", "role_id": adminRole}, userToken, 403)
	request("PUT", "/roles/"+hotspotRole+"/permissions", map[string]any{"permissions": []string{}}, adminToken, 200)
	rolePath := fmt.Sprintf("/users/%s/roles", id)
	request("PUT", rolePath, map[string]any{"role_ids": []string{mohRole, hotspotRole}}, userToken, 403)
	request("PUT", rolePath, map[string]any{"role_ids": []string{mohRole, hotspotRole, hotspotRole}}, adminToken, 200)
	request("PUT", "/roles/"+mohRole+"/permissions", map[string]any{"permissions": []string{"roles:read"}}, adminToken, 200)
	request("PUT", "/roles/"+hotspotRole+"/permissions", map[string]any{"permissions": []string{"users:read"}}, adminToken, 200)
	request("GET", "/roles", nil, userToken, 200)
	request("GET", "/users?limit=1", nil, userToken, 200)
	me = request("GET", "/auth/me", nil, userToken, 200)["data"].(map[string]any)
	if len(me["roles"].([]any)) != 2 {
		t.Fatal("role assignments were lost or duplicated")
	}
	request("PUT", rolePath, map[string]any{"role_ids": []string{mohRole, unknownID}}, adminToken, 422)
	request("GET", "/users?limit=1", nil, userToken, 200)
	request("PUT", rolePath, map[string]any{"role_ids": nil}, adminToken, 422)
	request("PUT", rolePath, map[string]any{"role_ids": []string{}}, adminToken, 200)
	request("GET", "/roles", nil, userToken, 403)
	request("GET", "/users", nil, userToken, 403)
	request("PUT", fmt.Sprintf("/users/%s/roles", adminID), map[string]any{"role_ids": []string{mohRole, hotspotRole}}, adminToken, 409)
	request("PUT", "/roles/"+adminRole+"/permissions", map[string]any{"permissions": []string{}}, adminToken, 409)
	request("PATCH", fmt.Sprintf("/users/%s/status", id), map[string]any{"status": "disabled"}, adminToken, 200)
	request("GET", "/auth/me", nil, userToken, 403)
	login("newuser@example.test", "test-password-123", 403)
	request("PATCH", fmt.Sprintf("/users/%s/status", id), map[string]any{"status": "active"}, adminToken, 200)
	// Disabling revoked the user's sessions, so re-enabling does not revive the old token.
	request("GET", "/auth/me", nil, userToken, 401)
	userToken = login("newuser@example.test", "test-password-123", 200)
	request("GET", "/auth/me", nil, userToken, 200)
	testSessions(t, pool, request, login, adminToken, id, "newuser@example.test")
	testLoginIdentifiers(t, request, adminToken, mohRole)
	userToken = login("newuser@example.test", "test-password-123", 200)
	request("GET", "/users?limit=101", nil, adminToken, 400)
	request("GET", "/users?offset=-1", nil, adminToken, 400)
	request("GET", "/users/not-a-number", nil, adminToken, 400)
	request("GET", "/users/"+unknownID, nil, adminToken, 404)
	request("GET", "/users/123", nil, adminToken, 400)
	request("PUT", rolePath, map[string]any{"role_ids": []int{7}}, adminToken, 400)
	request("PATCH", fmt.Sprintf("/users/%s/status", adminID), map[string]any{"status": "disabled"}, adminToken, 409)
	request("PATCH", fmt.Sprintf("/users/%s/role", adminID), map[string]any{"role_id": mohRole}, adminToken, 409)
	created := map[string]any{"username": "second-admin", "email": "second-admin@example.test", "password": "test-password-123", "role_ids": []string{adminRole, hotspotRole}}
	secondID := request("POST", "/users", created, adminToken, 201)["data"].(map[string]any)["user_id"].(string)

	// Orders exercise the migrated schema and both sides of store authorization.
	var sourceID, destinationID, condomID, unitID string
	if err = pool.QueryRow(ctx, `
		WITH source AS (SELECT id FROM stores WHERE code = 'jms'),
		     region AS (INSERT INTO regions(uid, name) VALUES ('test-region', 'Test region') RETURNING id),
		     district AS (INSERT INTO districts(uid, name, region_id)
		         SELECT 'test-district', 'Test district', id FROM region RETURNING id),
		     destination AS (INSERT INTO stores(code, name, store_type, district_id)
		         SELECT 'test-district', 'Test district store', 'district', id FROM district RETURNING id),
		     product AS (SELECT id FROM condoms ORDER BY id LIMIT 1),
		     unit AS (SELECT id FROM unit_of_measures ORDER BY id LIMIT 1)
		SELECT source.id, destination.id, product.id, unit.id FROM source, destination, product, unit
	`).Scan(&sourceID, &destinationID, &condomID, &unitID); err != nil {
		t.Fatal(err)
	}
	orderBody := map[string]any{
		"condom_id": condomID, "quantity_needed": 100, "order_date": "2026-11-19",
		"ordered_from_store_id": sourceID, "ordered_for_store_id": destinationID,
		"unit_of_measure_id": unitID,
	}
	request("GET", "/orders", nil, "", 401)
	request("GET", "/orders", nil, userToken, 403)
	request("PUT", rolePath, map[string]any{"role_ids": []string{hotspotRole}}, adminToken, 200)
	request("PUT", "/roles/"+hotspotRole+"/permissions",
		map[string]any{"permissions": []string{"orders:read", "orders:create", "orders:fulfill"}}, adminToken, 200)
	if _, err = pool.Exec(ctx, `UPDATE users SET store_id=$1 WHERE id=$2`, sourceID, id); err != nil {
		t.Fatal(err)
	}
	request("POST", "/orders", orderBody, userToken, 403)
	order := request("POST", "/orders", orderBody, adminToken, 201)["data"].(map[string]any)
	if order["ordered_by_id"] != adminID || order["order_status"] != "pending" ||
		order["order_date"] != "2026-11-19" || order["quantity_issued"] != nil || order["handled_by_id"] != nil {
		t.Fatalf("unexpected new order: %v", order)
	}
	orderPath := "/orders/" + order["id"].(string)
	request("GET", orderPath, nil, userToken, 200)
	request("PATCH", orderPath+"/fulfill", map[string]any{"quantity_issued": 101}, userToken, 422)
	if _, err = pool.Exec(ctx, `UPDATE users SET store_id=$1 WHERE id=$2`, destinationID, id); err != nil {
		t.Fatal(err)
	}
	request("PATCH", orderPath+"/fulfill", map[string]any{"quantity_issued": 80}, userToken, 403)
	request("POST", "/orders", orderBody, userToken, 201)
	if _, err = pool.Exec(ctx, `UPDATE users SET store_id=$1 WHERE id=$2`, sourceID, id); err != nil {
		t.Fatal(err)
	}
	issued := request("PATCH", orderPath+"/fulfill", map[string]any{"quantity_issued": 80}, userToken, 200)["data"].(map[string]any)
	if issued["handled_by_id"] != id || issued["quantity_issued"] != float64(80) || issued["order_status"] != "fulfilled" {
		t.Fatalf("unexpected fulfillment: %v", issued)
	}
	request("PATCH", orderPath+"/fulfill", map[string]any{"quantity_issued": 80}, userToken, 409)
	if _, err = pool.Exec(ctx, `UPDATE users SET store_id=NULL WHERE id=$1`, id); err != nil {
		t.Fatal(err)
	}
	request("GET", orderPath, nil, userToken, 404)
	if visible := request("GET", "/orders", nil, userToken, 200)["data"]; len(visible.([]any)) != 0 {
		t.Fatalf("orders leaked to unassigned user: %v", visible)
	}

	testHotSpotActivation(t, pool, request, login, adminToken, destinationID)
	testOrderWorkflow(t, pool, request, login, adminToken, sourceID, destinationID, condomID, unitID)

	// Two simultaneous updates must leave at least one administrator active.
	results := make(chan error, 2)
	for _, userID := range []string{adminID, secondID} {
		go func(id string) { status := "disabled"; results <- repo.UpdateUserAccess(ctx, id, nil, &status) }(userID)
	}
	successes, conflicts := 0, 0
	for range 2 {
		err := <-results
		if err == nil {
			successes++
		} else if errors.Is(err, users.ErrLastAdmin) {
			conflicts++
		} else {
			t.Fatal(err)
		}
	}
	if successes != 1 || conflicts != 1 {
		t.Fatalf("concurrent admin changes: success=%d conflict=%d", successes, conflicts)
	}

	// Existing databases upgrade without altering legacy roles or granting extra access.
	upgradeName := name + "_upgrade"
	if _, err = admin.Exec(ctx, `CREATE DATABASE `+upgradeName); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if _, err := admin.Exec(ctx, `DROP DATABASE `+upgradeName+` WITH (FORCE)`); err != nil {
			t.Error(err)
		}
	})
	u.Path = "/" + upgradeName
	upgrade, err := pgxpool.New(ctx, u.String())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(upgrade.Close)
	schema, err := os.ReadFile(filepath.Join("..", "database", "migrations", "000001_init_schema.up.sql"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err = upgrade.Exec(ctx, string(schema)); err != nil {
		t.Fatal(err)
	}
	if _, err = upgrade.Exec(ctx, string(seed)); err != nil {
		t.Fatal(err)
	}
	if _, err = upgrade.Exec(ctx, `INSERT INTO orders
		(ordered_by, ordered_for, ordered_from, order_status, quantity_needed, order_date, comment)
		VALUES ('1', 'district', 'jms', 'pending', '20', '2026-11-19', 'legacy order fixture')`); err != nil {
		t.Fatal(err)
	}
	if _, err = upgrade.Exec(ctx, `CREATE TABLE schema_migrations(version bigint NOT NULL PRIMARY KEY,dirty boolean NOT NULL); INSERT INTO schema_migrations VALUES(1,false)`); err != nil {
		t.Fatal(err)
	}
	// Simulate a database that has already issued RBAC UUIDs and has custom grants.
	for _, migration := range []string{"000002_auth_rbac.up.sql", "000003_schema_rbac.up.sql"} {
		sql, err := os.ReadFile(filepath.Join("..", "database", "migrations", migration))
		if err != nil {
			t.Fatal(err)
		}
		if _, err := upgrade.Exec(ctx, string(sql)); err != nil {
			t.Fatal(err)
		}
	}
	var existingUserUUID, existingRoleUUID string
	if err = upgrade.QueryRow(ctx, `SELECT u.rbac_id, r.rbac_id FROM users u
		JOIN role_user ru ON ru.user_id = u.rbac_id JOIN roles r ON r.rbac_id = ru.role_id
		WHERE r.name = 'admin' ORDER BY u.id LIMIT 1`).Scan(&existingUserUUID, &existingRoleUUID); err != nil {
		t.Fatal(err)
	}
	if _, err = upgrade.Exec(ctx, `UPDATE schema_migrations SET version=3;
		INSERT INTO role_permission(role_id, permission_id)
		SELECT r.rbac_id, p.id FROM roles r CROSS JOIN permissions p WHERE r.name='moh' AND p.name='roles:read'`); err != nil {
		t.Fatal(err)
	}
	if err = database.RunMigrations(u.String()); err != nil {
		t.Fatal(err)
	}
	if err = upgrade.QueryRow(ctx, `SELECT (SELECT count(*) FROM users),(SELECT count(*) FROM role_permission rp JOIN roles r ON r.id = rp.role_id WHERE r.name<>'admin')`).Scan(&userCount, &roleCount); err != nil {
		t.Fatal(err)
	}
	if userCount != 455 || roleCount != 1 {
		t.Fatal("upgrade changed user count or lost custom permission grants")
	}
	// Upgrading a database that already holds the backup resolves the same duplicates.
	assertUniqueIdentifiers(t, upgrade)
	var sameAssignment bool
	if err = upgrade.QueryRow(ctx, `SELECT EXISTS (
		SELECT 1 FROM role_user WHERE user_id=$1 AND role_id=$2
	)`, existingUserUUID, existingRoleUUID).Scan(&sameAssignment); err != nil {
		t.Fatal(err)
	}
	if !sameAssignment {
		t.Fatal("upgrade changed an existing RBAC UUID or assignment")
	}

	var archived, current int
	if err = upgrade.QueryRow(ctx, `SELECT
		(SELECT count(*) FROM legacy_orders WHERE comment = 'legacy order fixture'),
		(SELECT count(*) FROM orders)`).Scan(&archived, &current); err != nil {
		t.Fatal(err)
	}
	if archived != 1 || current != 0 {
		t.Fatalf("legacy orders upgrade: archived=%d current=%d", archived, current)
	}

}
