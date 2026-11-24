package integration

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http/httptest"
	"testing"
	"time"

	"clims-backend/internal/features/audit"
	"clims-backend/internal/features/auth"
	"clims-backend/internal/features/rbac"
	"clims-backend/internal/features/synclog"
	"clims-backend/internal/features/users"
	"clims-backend/internal/middleware"

	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/requestid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// testSyncLog checks the field app's sync log: uploads, out-of-order versions, who may read it,
// and matching a phone's entry to the audit log through X-Client-Entry-Id. It runs on its own app,
// wired like the server, so earlier tests cannot have used up its sign-in rate limits.
func testSyncLog(t *testing.T, pool *pgxpool.Pool, repo *users.Repository, service *users.Service,
	auditor *audit.Service, admin string,
) {
	t.Helper()
	app := fiber.New()
	app.Use(requestid.New())
	app.Use(audit.Middleware(auditor))
	v1 := app.Group("/api/v1")
	jwtMiddleware := middleware.NewJWTMiddleware("test-secret")
	activeUser := users.ActiveUser(repo)
	auth.RegisterRoutes(v1, auth.NewHandler(repo, service, "test-secret", auditor), jwtMiddleware, activeUser)
	audit.RegisterRoutes(v1, audit.NewRepository(pool), auditor, jwtMiddleware, activeUser, rbac.RequirePermission("audit:read"))
	synclog.RegisterRoutes(v1, synclog.NewRepository(pool), jwtMiddleware, activeUser)

	request := func(method, path string, body any, headers map[string]string, want int) map[string]any {
		t.Helper()
		data, err := json.Marshal(body)
		if err != nil {
			t.Fatal(err)
		}
		req := httptest.NewRequest(method, "/api/v1"+path, bytes.NewReader(data))
		req.Header.Set("Content-Type", "application/json")
		for key, value := range headers {
			req.Header.Set(key, value)
		}
		res, err := app.Test(req, slowRequests)
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()
		payload, _ := io.ReadAll(res.Body)
		var decoded map[string]any
		_ = json.Unmarshal(payload, &decoded)
		if res.StatusCode != want {
			t.Fatalf("%s %s: got %d want %d: %s", method, path, res.StatusCode, want, payload)
		}
		return decoded
	}
	bearer := func(token string) map[string]string { return map[string]string{"Authorization": "Bearer " + token} }
	adminAuth := bearer(admin)

	// A field user with no sync_logs:read reports their phone's entries.
	signup := map[string]any{"username": "sync-log-user", "email": "sync-log-user@example.test", "password": "sync-log-password-1"}
	userID := request("POST", "/auth/register", signup, nil, 201)["data"].(map[string]any)["user_id"].(string)
	login := map[string]any{"login": "sync-log-user", "password": "sync-log-password-1"}
	fieldAuth := bearer(request("POST", "/auth/login", login, nil, 200)["data"].(map[string]any)["token"].(string))

	saved := time.Now().UTC().Add(-time.Hour).Truncate(time.Second)
	entry := func(status string, changed time.Time, record any) map[string]any {
		return map[string]any{
			"client_entry_id": "SL-sync-log-test-1", "action": "mapHotspot", "status": status,
			"server_record_id": record, "queued_at": saved, "changed_at": changed,
			"attempt_count": 2, "attempts": []map[string]any{
				{"at": saved.Add(time.Minute), "http_status": nil, "error": "network"},
				{"at": changed, "http_status": 503, "error": "http_503"},
			},
		}
	}
	upload := func(entries ...map[string]any) map[string]any {
		return map[string]any{"device": map[string]any{"platform": "android", "os_version": "14", "app_version": "2.2.0"},
			"entries": entries}
	}
	search := func(query string) []any {
		t.Helper()
		return request("GET", "/sync-log?"+query, nil, adminAuth, 200)["data"].([]any)
	}

	request("POST", "/sync-log", upload(entry("retrying", saved.Add(10*time.Minute), nil)), fieldAuth, 200)
	found := search("user_id=" + userID)
	if len(found) != 1 {
		t.Fatalf("want the user's one entry, got %v", found)
	}
	got := found[0].(map[string]any)
	if got["status"] != "retrying" || got["last_error"] != "http_503" || got["attempt_count"] != float64(2) ||
		got["user"].(map[string]any)["username"] != "sync-log-user" ||
		got["device"].(map[string]any)["app_version"] != "2.2.0" {
		t.Fatalf("stored entry: %v", got)
	}

	// The phone reports it sent; a stale copy of an older version arriving afterwards changes nothing.
	request("POST", "/sync-log", upload(entry("sent", saved.Add(20*time.Minute), "f2b8c1de-0000-4000-8000-000000000001")), fieldAuth, 200)
	request("POST", "/sync-log", upload(entry("waiting", saved, nil)), fieldAuth, 200)
	got = search("client_entry_id=SL-sync-log-test-1")[0].(map[string]any)
	if got["status"] != "sent" || got["server_record_id"] != "f2b8c1de-0000-4000-8000-000000000001" {
		t.Fatalf("an older version replaced a newer one: %v", got)
	}
	if len(search("status=refused&user_id="+userID)) != 0 || len(search("status=sent&user_id="+userID)) != 1 {
		t.Fatal("status filter")
	}
	if len(search("from="+saved.Add(time.Minute).Format(time.RFC3339)+"&user_id="+userID)) != 0 {
		t.Fatal("from filter must bound when the action was saved")
	}

	// Free text never reaches the server, and readers need the permission.
	bad := entry("refused", saved.Add(30*time.Minute), nil)
	bad["attempts"] = []map[string]any{{"at": saved, "error": "Couldn't submit Mama Rose Bar"}}
	request("POST", "/sync-log", upload(bad), fieldAuth, 422)
	request("GET", "/sync-log", nil, fieldAuth, 403)
	request("GET", "/sync-log?status=discarded", nil, adminAuth, 400)
	request("GET", "/sync-log?from=2026-11-24&to=2026-11-23", nil, adminAuth, 400)

	// A request tagged with the phone's entry leaves that entry in the audit details, and the audit
	// search finds it; a malformed tag is ignored rather than stored.
	wrong := map[string]any{"login": "sync-log-user", "password": "wrong-password-1"}
	request("POST", "/auth/login", wrong, map[string]string{audit.ClientEntryHeader: "SL-sync-log-test-1"}, 401)
	request("POST", "/auth/login", wrong, map[string]string{audit.ClientEntryHeader: "bad id!"}, 401)
	tagged := request("GET", "/audit?client_entry_id=SL-sync-log-test-1", nil, adminAuth, 200)["data"].([]any)
	if len(tagged) != 1 || tagged[0].(map[string]any)["action"] != "auth.login_failed" {
		t.Fatalf("tagged audit entries: %v", tagged)
	}
	var malformed int
	if err := pool.QueryRow(context.Background(), `SELECT count(*) FROM audit_log WHERE details->>'client_entry_id' = 'bad id!'`).
		Scan(&malformed); err != nil || malformed != 0 {
		t.Fatalf("a malformed client entry ID was stored: %d %v", malformed, err)
	}
	request("GET", "/audit?client_entry_id=x", nil, adminAuth, 400)
}
