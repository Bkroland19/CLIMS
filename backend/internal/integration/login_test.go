package integration

import (
	"context"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

// testLoginIdentifiers signs in by email, username and phone number, each unique to one account.
func testLoginIdentifiers(t *testing.T, request func(string, string, any, string, int) map[string]any, adminToken, roleID string) {
	t.Helper()
	account := func(username, email, phone string) map[string]any {
		return map[string]any{"username": username, "email": email, "phone_number": phone,
			"password": "kato-password-1", "role_ids": []string{roleID}}
	}
	kato := request("POST", "/users", account("kato.musa", "kato@example.test", "0772 123456"), adminToken, 201)["data"].(map[string]any)["user_id"].(string)

	// Each identifier belongs to one account, compared without regard to case or phone format.
	for _, duplicate := range []struct {
		body    map[string]any
		message string
	}{
		{account("KATO.Musa", "other-1@example.test", "0701000001"), "username already exists"},
		{account("other-2", "Kato@Example.test", "0701000002"), "email already exists"},
		{account("other-3", "other-3@example.test", "+256772123456"), "phone number already belongs to another account"},
	} {
		if got := request("POST", "/users", duplicate.body, adminToken, 409)["message"]; got != duplicate.message {
			t.Fatalf("duplicate %v: got %q, want %q", duplicate.body, got, duplicate.message)
		}
	}
	// Accounts without a phone number do not conflict with each other.
	request("POST", "/users", account("no-phone-1", "no-phone-1@example.test", ""), adminToken, 201)
	request("POST", "/users", account("no-phone-2", "no-phone-2@example.test", ""), adminToken, 201)

	signIn := func(body map[string]any, code int) {
		t.Helper()
		result := request("POST", "/auth/login", body, "", code)
		if code == 200 && result["data"].(map[string]any)["user"].(map[string]any)["id"] != kato {
			t.Fatalf("%v signed in to the wrong account: %v", body, result)
		}
	}
	for _, login := range []string{"kato@example.test", "kato.musa", " KATO.MUSA ", "0772123456", "+256 772 123 456"} {
		signIn(map[string]any{"login": login, "password": "kato-password-1"}, 200)
	}
	// Existing clients still send the identifier as "email".
	signIn(map[string]any{"email": "kato.musa", "password": "kato-password-1"}, 200)
	signIn(map[string]any{"login": "kato.musa", "password": "wrong-password"}, 401)
	signIn(map[string]any{"password": "kato-password-1"}, 422)
}

// assertUniqueIdentifiers checks that no two accounts share a username or phone number, and that the
// legacy duplicates were resolved by renaming or clearing with the original kept.
func assertUniqueIdentifiers(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()
	var sharedUsernames, sharedPhones, renamed, cleared int
	if err := pool.QueryRow(context.Background(), `SELECT
		(SELECT count(*) FROM (SELECT FROM users GROUP BY lower(btrim(username)) HAVING count(*) > 1) d),
		(SELECT count(*) FROM (SELECT FROM users WHERE normalize_phone(phone_number) IS NOT NULL
			GROUP BY normalize_phone(phone_number) HAVING count(*) > 1) d),
		(SELECT count(*) FROM users WHERE previous_username IS NOT NULL
			AND username = previous_username || '-' || legacy_id),
		(SELECT count(*) FROM users WHERE previous_phone_number IS NOT NULL AND phone_number = '')`).
		Scan(&sharedUsernames, &sharedPhones, &renamed, &cleared); err != nil {
		t.Fatal(err)
	}
	// The legacy backup has 39 surplus usernames and 112 surplus phone numbers.
	if sharedUsernames != 0 || sharedPhones != 0 || renamed != 39 || cleared != 112 {
		t.Fatalf("identifiers: shared usernames=%d phones=%d, renamed=%d cleared=%d", sharedUsernames, sharedPhones, renamed, cleared)
	}
}
