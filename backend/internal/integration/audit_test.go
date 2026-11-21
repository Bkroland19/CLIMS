package integration

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http/httptest"
	"strings"
	"testing"

	"clims-backend/internal/features/audit"
	"clims-backend/internal/features/auth"
	"clims-backend/internal/features/users"
	"clims-backend/internal/middleware"

	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/requestid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// testAudit checks the audit log end to end: authentication events, request context,
// secrets, append-only storage, transactions, and the search API. It runs on its own app,
// wired like the server, so earlier tests cannot have used up its sign-in rate limits.
func testAudit(t *testing.T, pool *pgxpool.Pool, repo *users.Repository, service *users.Service,
	auditor *audit.Service, admin string,
) {
	t.Helper()
	ctx := context.Background()
	app := fiber.New()
	app.Use(requestid.New())
	app.Use(audit.Middleware())
	v1 := app.Group("/api/v1")
	jwtMiddleware := middleware.NewJWTMiddleware("test-secret")
	activeUser := users.ActiveUser(repo)
	auth.RegisterRoutes(v1, auth.NewHandler(repo, service, "test-secret", auditor), jwtMiddleware, activeUser)
	users.RegisterRoutes(v1, users.NewHandler(repo, service), jwtMiddleware, activeUser)
	audit.RegisterRoutes(v1, audit.NewRepository(pool), auditor, jwtMiddleware, activeUser)

	// raw sends a request with chosen headers and returns the status and decoded body.
	raw := func(method, path string, body any, headers map[string]string) (int, map[string]any) {
		t.Helper()
		var data []byte
		if body != nil {
			var err error
			if data, err = json.Marshal(body); err != nil {
				t.Fatal(err)
			}
		}
		req := httptest.NewRequest(method, "/api/v1"+path, bytes.NewReader(data))
		req.Header.Set("Content-Type", "application/json")
		for key, value := range headers {
			req.Header.Set(key, value)
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
		var decoded map[string]any
		_ = json.Unmarshal(payload, &decoded)
		return res.StatusCode, decoded
	}
	request := func(method, path string, body any, token string, want int) map[string]any {
		t.Helper()
		headers := map[string]string{}
		if token != "" {
			headers["Authorization"] = "Bearer " + token
		}
		status, decoded := raw(method, path, body, headers)
		if status != want {
			t.Fatalf("%s %s: got %d want %d: %v", method, path, status, want, decoded)
		}
		return decoded
	}
	login := func(identifier, password string, want int) string {
		t.Helper()
		result := request("POST", "/auth/login", map[string]any{"login": identifier, "password": password}, "", want)
		if want != 200 {
			return ""
		}
		return result["data"].(map[string]any)["token"].(string)
	}
	// entries searches the log as the admin.
	entries := func(query string) []map[string]any {
		t.Helper()
		var found []map[string]any
		for _, item := range request("GET", "/audit?limit=100&"+query, nil, admin, 200)["data"].([]any) {
			found = append(found, item.(map[string]any))
		}
		return found
	}
	find := func(list []map[string]any, action string) map[string]any {
		for _, entry := range list {
			if entry["action"] == action {
				return entry
			}
		}
		return nil
	}
	adminID := request("GET", "/auth/me", nil, admin, 200)["data"].(map[string]any)["id"].(string)
	var registeredRole string
	if err := pool.QueryRow(ctx, `SELECT id FROM roles WHERE name = 'registered user'`).Scan(&registeredRole); err != nil {
		t.Fatal(err)
	}

	// Public sign-up: the new account is its own actor; no password in the entry.
	signup := map[string]any{"username": "audit-user", "email": "audit-user@example.test", "password": "audit-password-123"}
	userID := request("POST", "/auth/register", signup, "", 201)["data"].(map[string]any)["user_id"].(string)
	userLog := entries("subject_type=user&subject_id=" + userID)
	registered := find(userLog, "auth.registered")
	if registered == nil || registered["actor"].(map[string]any)["id"] != userID ||
		registered["changes"].(map[string]any)["username"].(map[string]any)["after"] != "audit-user" {
		t.Fatalf("registration entry: %v", registered)
	}

	// Failed logins record the typed identifier and, when it names one account, that account.
	raw("POST", "/auth/login", map[string]any{"login": "audit-user", "password": "wrong-password-1"}, nil)
	raw("POST", "/auth/login", map[string]any{"login": "nobody-at-all", "password": "wrong-password-1"}, nil)
	failures := entries("action=auth.login_failed&outcome=failure")
	var wrongPassword, unknownAccount map[string]any
	for _, entry := range failures {
		switch entry["details"].(map[string]any)["identifier"] {
		case "audit-user":
			wrongPassword = entry
		case "nobody-at-all":
			unknownAccount = entry
		}
	}
	if wrongPassword == nil || wrongPassword["reason"] != "invalid_credentials" ||
		wrongPassword["target"].(map[string]any)["id"] != userID || wrongPassword["actor"] != nil {
		t.Fatalf("wrong password entry: %v", wrongPassword)
	}
	if unknownAccount == nil || unknownAccount["target"] != nil {
		t.Fatalf("unknown account entry: %v", unknownAccount)
	}

	// A disabled account's login is refused and recorded. Disabling also revokes sessions,
	// so this runs before the session used by the refresh checks.
	request("PATCH", "/users/"+userID+"/status", map[string]any{"status": "disabled"}, admin, 200)
	request("POST", "/auth/login", map[string]any{"login": "audit-user@example.test", "password": "audit-password-123"}, "", 403)
	if find(entries("action=auth.login_failed&subject_type=user&subject_id="+userID), "auth.login_failed")["reason"] != "account_disabled" {
		t.Fatal("disabled-account login was not recorded")
	}
	request("PATCH", "/users/"+userID+"/status", map[string]any{"status": "active"}, admin, 200)
	// Successful login: actor, session, address, device and request ID are recorded.
	status, body := raw("POST", "/auth/login", map[string]any{"login": "audit-user@example.test", "password": "audit-password-123"},
		map[string]string{"User-Agent": "audit-browser/1"})
	if status != 200 {
		t.Fatalf("login: %d %v", status, body)
	}
	tokens := body["data"].(map[string]any)
	refresh, sessionID := tokens["refresh_token"].(string), tokens["session_id"].(string)
	loggedIn := find(entries("action=auth.login_succeeded&subject_type=session&subject_id="+sessionID), "auth.login_succeeded")
	if loggedIn == nil || loggedIn["actor"].(map[string]any)["id"] != userID || loggedIn["session_id"] != sessionID ||
		loggedIn["user_agent"] != "audit-browser/1" || loggedIn["ip_address"] == nil || loggedIn["request_id"] == nil {
		t.Fatalf("login entry: %v", loggedIn)
	}

	refreshCount := func() int {
		t.Helper()
		var count int
		if err := pool.QueryRow(ctx, `SELECT count(*) FROM audit_log a JOIN audit_log_subjects s ON s.audit_id = a.id
			WHERE s.subject_type = 'session' AND s.subject_id = $1 AND a.action LIKE 'auth.refresh%'`, sessionID).Scan(&count); err != nil {
			t.Fatal(err)
		}
		return count
	}

	// Refreshes: a routine one is not recorded; a new device is; a replay revokes and is recorded.
	status, body = raw("POST", "/auth/refresh", map[string]any{"refresh_token": refresh}, map[string]string{"User-Agent": "audit-browser/1"})
	if status != 200 || refreshCount() != 0 {
		t.Fatalf("routine refresh: %d, %d entries", status, refreshCount())
	}
	rotated := body["data"].(map[string]any)["refresh_token"].(string)
	status, body = raw("POST", "/auth/refresh", map[string]any{"refresh_token": rotated}, map[string]string{"User-Agent": "audit-phone/2"})
	if status != 200 {
		t.Fatalf("refresh from a new device: %d", status)
	}
	moved := find(entries("action=auth.refresh_location_changed&subject_type=session&subject_id="+sessionID), "auth.refresh_location_changed")
	if moved == nil || moved["user_agent"] != "audit-phone/2" || moved["details"].(map[string]any)["previous_user_agent"] != "audit-browser/1" {
		t.Fatalf("new-device refresh entry: %v", moved)
	}
	latest := body["data"].(map[string]any)["refresh_token"].(string)
	// Age the last rotation past the reuse grace window, then replay the previous token.
	if _, err := pool.Exec(ctx, `UPDATE user_sessions SET refreshed_at = CURRENT_TIMESTAMP - interval '1 minute' WHERE id = $1`, sessionID); err != nil {
		t.Fatal(err)
	}
	if status, _ = raw("POST", "/auth/refresh", map[string]any{"refresh_token": rotated}, nil); status != 401 {
		t.Fatalf("replayed refresh token: %d", status)
	}
	replay := find(entries("action=auth.refresh_replayed&subject_type=session&subject_id="+sessionID), "auth.refresh_replayed")
	if replay == nil || replay["outcome"] != "failure" || replay["reason"] != "refresh_token_reused" {
		t.Fatalf("replay entry: %v", replay)
	}
	if status, _ = raw("POST", "/auth/refresh", map[string]any{"refresh_token": latest}, nil); status != 401 {
		t.Fatal("the replay did not revoke the session")
	}
	if find(entries("action=auth.refresh_refused&subject_type=session&subject_id="+sessionID), "auth.refresh_refused")["reason"] != "session_ended" {
		t.Fatal("refresh of a revoked session was not recorded")
	}
	if replays := len(entries("action=auth.refresh_replayed&subject_type=session&subject_id=" + sessionID)); replays != 1 {
		t.Fatalf("one replay should be one entry, got %d", replays)
	}

	// Logout is recorded against the session it ends.
	userToken := login("audit-user@example.test", "audit-password-123", 200)
	request("POST", "/auth/logout", nil, userToken, 200)
	if find(entries("action=auth.logged_out&subject_type=user&subject_id="+userID), "auth.logged_out") == nil {
		t.Fatal("logout was not recorded")
	}

	// Admin-created accounts name the admin as actor.
	createdID := request("POST", "/users", map[string]any{"username": "audit-created", "email": "audit-created@example.test",
		"password": "audit-password-123", "role_ids": []string{registeredRole}}, admin, 201)["data"].(map[string]any)["user_id"].(string)
	if entry := find(entries("subject_type=user&subject_id="+createdID), "user.created"); entry == nil ||
		entry["actor"].(map[string]any)["id"] != adminID {
		t.Fatalf("admin-created account entry: %v", entry)
	}

	// No password or token reached any entry written above.
	var leaked bool
	if err := pool.QueryRow(ctx, `SELECT EXISTS (SELECT FROM audit_log
		WHERE strpos(concat(details::text, changes::text), 'wrong-password') > 0
			OR strpos(concat(details::text, changes::text), 'audit-password') > 0
			OR strpos(concat(details::text, changes::text), $1) > 0)`, refresh).Scan(&leaked); err != nil {
		t.Fatal(err)
	}
	if leaked {
		t.Fatal("a password or token reached the audit log")
	}

	// The database refuses changes to entries, from anyone.
	for _, statement := range []string{
		`UPDATE audit_log SET reason = 'edited'`, `DELETE FROM audit_log`, `TRUNCATE audit_log CASCADE`,
		`UPDATE audit_log_subjects SET subject_id = 'x'`, `DELETE FROM audit_log_subjects`,
	} {
		if _, err := pool.Exec(ctx, statement); err == nil || !strings.Contains(err.Error(), "append-only") {
			t.Fatalf("%s was not refused: %v", statement, err)
		}
	}

	// Entries recorded in a transaction disappear with it; system actors are named.
	direct := audit.NewService(pool)
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if err = direct.Record(ctx, tx, audit.Entry{Action: "test.rolled_back"}); err != nil {
		t.Fatal(err)
	}
	if err = tx.Rollback(ctx); err != nil {
		t.Fatal(err)
	}
	if len(entries("action=test.rolled_back")) != 0 {
		t.Fatal("an entry outlived its rolled-back transaction")
	}
	if err = direct.RecordNow(audit.WithSystemActor(ctx, "nightly-job"), audit.Entry{Action: "test.system_job"}); err != nil {
		t.Fatal(err)
	}
	if job := find(entries("action=test.system_job"), "test.system_job"); job == nil || job["system_actor"] != "nightly-job" || job["actor"] != nil {
		t.Fatalf("system actor entry: %v", job)
	}

	// Searching needs audit:read, validates its filters, and is itself audited.
	request("GET", "/audit", nil, login("audit-user@example.test", "audit-password-123", 200), 403)
	for _, query := range []string{"outcome=maybe", "subject_type=user", "actor_id=nope", "from=yesterday", "limit=101"} {
		request("GET", "/audit?"+query, nil, admin, 400)
	}
	searches := entries("action=audit.searched&actor_id=" + adminID)
	if len(searches) == 0 || searches[0]["details"].(map[string]any)["filters"] == nil {
		t.Fatal("searches of the audit log were not recorded")
	}
}
