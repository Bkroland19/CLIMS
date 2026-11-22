package integration

import (
	"context"
	"strings"
	"testing"

	"clims-backend/internal/features/inventory"
	"clims-backend/internal/features/notifications"

	"github.com/jackc/pgx/v5/pgxpool"
)

// testExpiryAlerts runs after the batch expiry test, which leaves the warehouse holding the expired
// EXP-1 and the district holding NEAR-1 (ten days left), LATE-1 (a year left) and stock of unknown
// expiry. Each store's stock managers hear of their own batches once: EXP-1 has expired, NEAR-1 is
// expiring; LATE-1 and unknown expiry are not announced.
func testExpiryAlerts(t *testing.T, pool *pgxpool.Pool,
	request func(string, string, any, string, int) map[string]any,
	districtToken, warehouseToken, warehouse, district string,
) {
	t.Helper()
	ctx := context.Background()
	exec := func(sql string, args ...any) {
		t.Helper()
		if _, err := pool.Exec(ctx, sql, args...); err != nil {
			t.Fatal(err)
		}
	}
	// The workflow test's accounts manage stock for this check only.
	exec(`INSERT INTO role_permission (role_id, permission_id)
		SELECT r.id, p.id FROM roles r JOIN permissions p ON p.name = 'inventory:manage'
		WHERE r.name IN ('jms', 'dfcp') ON CONFLICT DO NOTHING`)
	defer exec(`DELETE FROM role_permission rp USING roles r, permissions p
		WHERE rp.role_id = r.id AND rp.permission_id = p.id AND p.name = 'inventory:manage' AND r.name IN ('jms', 'dfcp')`)

	notifier := notifications.NewService()
	notifier.MustRegister(inventory.NotificationTypes()...)
	alerts := inventory.NewExpiryAlerts(pool, notifier)
	if sent, err := alerts.Check(ctx); err != nil || sent != 2 {
		t.Fatalf("first check announced %d batches (%v), want EXP-1 and NEAR-1", sent, err)
	}
	if again, err := alerts.Check(ctx); err != nil || again != 0 {
		t.Fatalf("a second check announced %d batches again (%v)", again, err)
	}

	inbox := func(token string) map[string]map[string]any {
		t.Helper()
		found := map[string]map[string]any{}
		for _, item := range request("GET", "/notifications?limit=100", nil, token, 200)["data"].([]any) {
			n := item.(map[string]any)
			if strings.HasPrefix(n["type"].(string), "inventory.batch_") {
				found[n["type"].(string)+" "+n["data"].(map[string]any)["batch"].(string)] = n
			}
		}
		return found
	}
	districtNotices, warehouseNotices := inbox(districtToken), inbox(warehouseToken)
	soon, gone := districtNotices["inventory.batch_expiring NEAR-1"], warehouseNotices["inventory.batch_expired EXP-1"]
	if len(districtNotices) != 1 || len(warehouseNotices) != 1 || soon == nil || gone == nil {
		t.Fatalf("expiry notifications: district %v, warehouse %v", districtNotices, warehouseNotices)
	}
	if !strings.Contains(soon["body"].(string), "in batch NEAR-1, which expires on") || soon["resource_type"] != "stock_batch" ||
		soon["data"].(map[string]any)["store_id"] != district ||
		!strings.Contains(gone["body"].(string), "can no longer be dispatched") ||
		gone["data"].(map[string]any)["store_id"] != warehouse {
		t.Fatalf("expiry notifications: %v / %v", soon, gone)
	}

	// Once the expiring batch expires it is announced again, as expired.
	var expiry string
	if err := pool.QueryRow(ctx, `SELECT expiry_date::text FROM stock_batches WHERE store_id = $1 AND batch_number = 'NEAR-1'`,
		district).Scan(&expiry); err != nil {
		t.Fatal(err)
	}
	exec(`UPDATE stock_batches SET expiry_date = current_date - 1 WHERE store_id = $1 AND batch_number = 'NEAR-1'`, district)
	defer exec(`UPDATE stock_batches SET expiry_date = $2::date WHERE store_id = $1 AND batch_number = 'NEAR-1'`, district, expiry)
	if sent, err := alerts.Check(ctx); err != nil || sent != 1 {
		t.Fatalf("the expired NEAR-1 was announced %d times (%v)", sent, err)
	}
	if inbox(districtToken)["inventory.batch_expired NEAR-1"] == nil {
		t.Fatal("no expired notice for NEAR-1")
	}
}
