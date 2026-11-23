package auth

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

// TestPortalSignInRequirements checks the callback against the identity-sync contract's browser
// sign-in requirements. Every refusal must leave no session behind.
func TestPortalSignInRequirements(t *testing.T) {
	const origin = "https://clims.example.org"
	idp := newTestIdP(t)
	repo := newFakeAccounts()
	linked, disabled, roleless := uuid.NewString(), uuid.NewString(), uuid.NewString()
	repo.add(linked, "active", "DCFP")
	repo.add(disabled, "inactive", "DCFP")
	repo.add(roleless, "active")
	repo.links["linked"], repo.links["disabled"], repo.links["roleless"] = linked, disabled, roleless
	sso, err := NewSSO(context.Background(), idp.issuer, "clims", "client-secret", origin, syncSecret, repo)
	if err != nil {
		t.Fatal(err)
	}
	app := fiber.New()
	sso.Register(app)
	idp.redirect = origin + ssoPath + "/callback"
	otherKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}

	send := func(req *http.Request) *http.Response {
		t.Helper()
		res, err := app.Test(req)
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { res.Body.Close() })
		return res
	}
	cookie := func(res *http.Response, name string) *http.Cookie {
		for _, c := range res.Cookies() {
			if c.Name == name && c.Value != "" {
				return c
			}
		}
		return nil
	}
	// signIn runs start and callback. tamper may change the callback query before it is sent.
	signIn := func(tamper func(url.Values)) *http.Response {
		t.Helper()
		start := send(httptest.NewRequest("GET", origin+ssoPath+"/start", nil))
		loc, err := start.Location()
		if err != nil {
			t.Fatal(err)
		}
		q := loc.Query()
		if q.Get("code_challenge_method") != "S256" || q.Get("code_challenge") == "" || q.Get("nonce") == "" || q.Get("state") == "" {
			t.Fatalf("authorization request lacks PKCE S256, state or nonce: %s", loc)
		}
		idp.nonce, idp.challenge = q.Get("nonce"), q.Get("code_challenge")
		callback := url.Values{"code": {"c"}, "state": {q.Get("state")}}
		if tamper != nil {
			tamper(callback)
		}
		req := httptest.NewRequest("GET", origin+ssoPath+"/callback?"+callback.Encode(), nil)
		req.AddCookie(cookie(start, flowCookie))
		return send(req)
	}
	refused := func(t *testing.T, reason string, tamper func(url.Values)) {
		t.Helper()
		before := len(repo.sessions)
		res := signIn(tamper)
		if loc := res.Header.Get("Location"); loc != origin+"/sign-in?sso_error="+reason {
			t.Fatalf("redirected to %q, want refusal %q", loc, reason)
		}
		if cookie(res, handoffCookie) != nil || len(repo.sessions) != before {
			t.Fatal("a refused sign-in created a session")
		}
	}
	reset := func() {
		idp.subject, idp.roles, idp.editIDToken, idp.signingKey = "linked", []string{accessRole}, nil, nil
	}

	cases := []struct {
		name, reason string
		setup        func()
		tamper       func(url.Values)
	}{
		{name: "unlinked identity", reason: "unavailable", setup: func() { idp.subject = "not-linked" }},
		{name: "missing access-role claim", reason: "denied", setup: func() { idp.editIDToken = func(c jwt.MapClaims) { delete(c, "clims_roles") } }},
		{name: "other roles only", reason: "denied", setup: func() { idp.roles = []string{"poes_access"} }},
		{name: "disabled local account", reason: "unavailable", setup: func() { idp.subject = "disabled" }},
		{name: "local account without a role", reason: "unavailable", setup: func() { idp.subject = "roleless" }},
		{name: "state mismatch", reason: "invalid", tamper: func(q url.Values) { q.Set("state", "forged") }},
		{name: "missing code", reason: "invalid", tamper: func(q url.Values) { q.Del("code") }},
		{name: "IdP error", reason: "invalid", tamper: func(q url.Values) { q.Set("error", "access_denied") }},
		{name: "nonce mismatch", reason: "invalid", setup: func() { idp.editIDToken = func(c jwt.MapClaims) { c["nonce"] = "replayed" } }},
		{name: "wrong audience", reason: "invalid", setup: func() { idp.editIDToken = func(c jwt.MapClaims) { c["aud"] = "poesgo" } }},
		{name: "wrong issuer", reason: "invalid", setup: func() {
			idp.editIDToken = func(c jwt.MapClaims) { c["iss"] = "https://other.example.org/realms/moh" }
		}},
		{name: "expired ID token", reason: "invalid", setup: func() {
			idp.editIDToken = func(c jwt.MapClaims) { c["exp"] = time.Now().Add(-10 * time.Minute).Unix() }
		}},
		{name: "unverifiable signature", reason: "invalid", setup: func() { idp.signingKey = otherKey }},
		{name: "token for another client", reason: "denied", setup: func() {
			idp.editIDToken = func(c jwt.MapClaims) { c["aud"], c["azp"] = []string{"clims", "poesgo"}, "poesgo" }
		}},
	}
	for _, tc := range cases {
		t.Run(tc.name+" is refused", func(t *testing.T) {
			reset()
			if tc.setup != nil {
				tc.setup()
			}
			refused(t, tc.reason, tc.tamper)
		})
	}

	t.Run("replayed handoff is refused", func(t *testing.T) {
		reset()
		res := signIn(nil)
		handoff := cookie(res, handoffCookie)
		if res.Header.Get("Location") != origin+completePath || handoff == nil {
			t.Fatalf("linked sign-in failed: %q", res.Header.Get("Location"))
		}
		exchange := func() int {
			req := httptest.NewRequest("POST", origin+ssoPath+"/exchange", nil)
			req.Header.Set("Origin", origin)
			req.AddCookie(handoff)
			return send(req).StatusCode
		}
		if status := exchange(); status != 200 {
			t.Fatalf("first exchange returned %d", status)
		}
		if status := exchange(); status != 401 {
			t.Fatalf("replayed handoff returned %d, want 401", status)
		}
	})

	t.Run("flow cookie works for one callback", func(t *testing.T) {
		reset()
		start := send(httptest.NewRequest("GET", origin+ssoPath+"/start", nil))
		loc, _ := start.Location()
		idp.nonce, idp.challenge = loc.Query().Get("nonce"), loc.Query().Get("code_challenge")
		req := httptest.NewRequest("GET", origin+ssoPath+"/callback?code=c&state="+url.QueryEscape(loc.Query().Get("state")), nil)
		req.AddCookie(cookie(start, flowCookie))
		res := send(req)
		cleared := false
		for _, c := range res.Cookies() {
			cleared = cleared || (c.Name == flowCookie && c.Value == "")
		}
		if !cleared {
			t.Fatal("the callback must clear the flow cookie")
		}
	})
}

// TestSignInStraddlingRevokeLeavesNoSession: a callback holding an ID token issued before the revoke
// must not leave a live session, even when the revoke lands between the account lookup and creating
// the session. Removing access ends sessions immediately, including this one.
func TestSignInStraddlingRevokeLeavesNoSession(t *testing.T) {
	h := newSyncHarness(t, true)
	const origin = "https://clims.example.org"
	accountID := uuid.NewString()
	h.repo.add(accountID, "active", "DCFP")
	h.repo.links["portal-user"] = accountID
	sso, err := NewSSO(context.Background(), h.idp.issuer, "clims", "client-secret", origin, syncSecret, h.repo)
	if err != nil {
		t.Fatal(err)
	}
	sso.Register(h.app)
	h.idp.subject, h.idp.roles, h.idp.redirect = "portal-user", []string{accessRole}, origin+ssoPath+"/callback"
	// The ID token was issued a moment before the dashboard removed access and revoked.
	h.idp.editIDToken = func(c jwt.MapClaims) { c["iat"] = time.Now().Add(-2 * time.Second).Unix() }

	revoked := false
	h.repo.afterFind = func() {
		if !revoked {
			revoked = true
			h.do("POST", "/sessions/revoke", h.token, h.identity("portal-user"), 204)
		}
	}
	start, err := h.app.Test(httptest.NewRequest("GET", origin+ssoPath+"/start", nil))
	if err != nil {
		t.Fatal(err)
	}
	loc, err := start.Location()
	if err != nil {
		t.Fatal(err)
	}
	h.idp.nonce, h.idp.challenge = loc.Query().Get("nonce"), loc.Query().Get("code_challenge")
	req := httptest.NewRequest("GET", origin+ssoPath+"/callback?code=c&state="+url.QueryEscape(loc.Query().Get("state")), nil)
	for _, c := range start.Cookies() {
		if c.Name == flowCookie {
			req.AddCookie(c)
		}
	}
	res, err := h.app.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	if !revoked {
		t.Fatal("the revoke did not run during the callback")
	}
	for _, c := range res.Cookies() {
		if c.Name == handoffCookie && c.Value != "" {
			t.Error("the callback handed off a session after the revoke")
		}
	}
	for id, s := range h.repo.sessions {
		if s.userID == accountID && !s.revoked {
			t.Errorf("session %s is live after the revoke", id)
		}
	}
	if got := res.Header.Get("Location"); got != origin+"/sign-in?sso_error=denied" {
		t.Errorf("redirected to %q, want the denied refusal", got)
	}
}
