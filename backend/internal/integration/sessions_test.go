package integration

import (
	"context"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

// testSessions covers login statistics, refresh-token rotation and replay, sign-out, a user's own
// session list, and an administrator signing a user out. It leaves every session of the user revoked.
func testSessions(t *testing.T, pool *pgxpool.Pool,
	request func(string, string, any, string, int) map[string]any,
	login func(string, string, int) string,
	adminToken, userID, email string,
) {
	t.Helper()
	before := request("GET", "/users/"+userID, nil, adminToken, 200)["data"].(map[string]any)
	signedIn := request("POST", "/auth/login", map[string]any{"email": email, "password": "test-password-123"}, "", 200)["data"].(map[string]any)
	profile := signedIn["user"].(map[string]any)
	if profile["login_count"].(float64) != before["login_count"].(float64)+1 || profile["last_login_at"] == nil ||
		profile["active_sessions"].(float64) < 1 || signedIn["expires_in"].(float64) > 900 || signedIn["refresh_token"] == "" {
		t.Fatalf("login did not record the login or issue a refresh token: %v", signedIn)
	}

	// Refreshing rotates both tokens on the same session.
	oldRefresh := signedIn["refresh_token"].(string)
	refreshed := request("POST", "/auth/refresh", map[string]any{"refresh_token": oldRefresh}, "", 200)["data"].(map[string]any)
	if refreshed["refresh_token"] == oldRefresh || refreshed["session_id"] != signedIn["session_id"] {
		t.Fatalf("refresh did not rotate the token on the same session: %v", refreshed)
	}
	access := refreshed["token"].(string)
	request("GET", "/auth/me", nil, access, 200)
	request("POST", "/auth/refresh", map[string]any{"refresh_token": "not-a-token"}, "", 401)
	request("POST", "/auth/refresh", map[string]any{}, "", 400)
	// Two tabs refreshing together: the slower one is refused, but the session survives.
	request("POST", "/auth/refresh", map[string]any{"refresh_token": oldRefresh}, "", 401)
	request("GET", "/auth/me", nil, access, 200)
	// A replay after the grace window is treated as a stolen token and ends the session.
	if _, err := pool.Exec(context.Background(), `UPDATE user_sessions SET refreshed_at = refreshed_at - interval '1 minute'
		WHERE id = $1`, signedIn["session_id"]); err != nil {
		t.Fatal(err)
	}
	request("POST", "/auth/refresh", map[string]any{"refresh_token": oldRefresh}, "", 401)
	request("GET", "/auth/me", nil, access, 401)
	request("POST", "/auth/refresh", map[string]any{"refresh_token": refreshed["refresh_token"]}, "", 401)

	phone := login(email, "test-password-123", 200)
	laptop := login(email, "test-password-123", 200)

	sessions := request("GET", "/auth/sessions", nil, laptop, 200)["data"].([]any)
	var current, other map[string]any
	for _, item := range sessions {
		session := item.(map[string]any)
		if session["current"] == true {
			current = session
		} else if session["revoked_at"] == nil {
			other = session
		}
	}
	if current == nil || other == nil {
		t.Fatalf("expected the current session and another live one: %v", sessions)
	}

	// Signing out one device leaves the other signed in.
	request("DELETE", "/auth/sessions/"+other["id"].(string), nil, laptop, 200)
	request("DELETE", "/auth/sessions/"+other["id"].(string), nil, laptop, 404)
	request("GET", "/auth/me", nil, laptop, 200)
	request("POST", "/auth/logout", nil, laptop, 200)
	request("GET", "/auth/me", nil, laptop, 401)

	// A user cannot see or revoke someone else's sessions through their own endpoints.
	adminSessions := request("GET", "/auth/sessions", nil, adminToken, 200)["data"].([]any)
	request("DELETE", "/auth/sessions/"+adminSessions[0].(map[string]any)["id"].(string), nil, phone, 404)

	// An administrator lists a user's sessions and signs them out everywhere.
	request("GET", "/users/"+userID+"/sessions", nil, phone, 403)
	if listed := request("GET", "/users/"+userID+"/sessions", nil, adminToken, 200)["data"].([]any); len(listed) < 3 {
		t.Fatalf("admin should see the user's sessions: %v", listed)
	}
	revoked := request("DELETE", "/users/"+userID+"/sessions", nil, adminToken, 200)["data"].(map[string]any)
	if revoked["revoked"].(float64) < 1 {
		t.Fatalf("expected live sessions to be revoked: %v", revoked)
	}
	request("GET", "/auth/me", nil, phone, 401)
	request("GET", "/auth/me", nil, adminToken, 200)
}
