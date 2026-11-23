package auth

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"

	"github.com/go-jose/go-jose/v4"
	"github.com/gofiber/fiber/v3"
	"github.com/golang-jwt/jwt/v5"
	"github.com/jackc/pgx/v5"

	"clims-backend/internal/features/rbac"
	"clims-backend/internal/features/users"
)

// ssoFixture is one linked CLIMS account and the sessions started for it.
type ssoFixture struct {
	user     *users.User
	subject  string
	sessions map[string]string // refresh token -> user ID; a refresh consumes the token
}

func (f *ssoFixture) FindByOIDCIdentity(_ context.Context, _, subject string) (*users.User, error) {
	if subject != f.subject || f.user == nil {
		return nil, pgx.ErrNoRows
	}
	return f.user, nil
}

func (f *ssoFixture) CreateOIDCSession(_ context.Context, _, subject string, _ *time.Time, _, _ string) (users.IssuedSession, error) {
	if subject != f.subject || !signInEligible(f.user) {
		return users.IssuedSession{}, users.ErrIdentityAccountIneligible
	}
	userID := f.user.ID
	token := newFlowValue()
	f.sessions[token] = userID
	return users.IssuedSession{ID: "session-1", UserID: userID, RefreshToken: token, ExpiresAt: time.Now().Add(time.Hour)}, nil
}

func (f *ssoFixture) RefreshSession(_ context.Context, token, _, _ string) (users.IssuedSession, error) {
	userID, ok := f.sessions[token]
	if !ok {
		return users.IssuedSession{}, users.ErrRefreshInvalid
	}
	delete(f.sessions, token)
	next := newFlowValue()
	f.sessions[next] = userID
	return users.IssuedSession{ID: "session-1", UserID: userID, RefreshToken: next, ExpiresAt: time.Now().Add(time.Hour)}, nil
}

func (f *ssoFixture) GetUserByID(context.Context, string) (*users.User, error) {
	return f.user, nil
}

func TestPortalSSO(t *testing.T) {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	const origin = "https://clims.example.org"
	const subject = "keycloak-user"
	var issuer, nonce, challenge string
	var roles []string
	mux := http.NewServeMux()
	mux.HandleFunc("/.well-known/openid-configuration", func(w http.ResponseWriter, _ *http.Request) {
		json.NewEncoder(w).Encode(map[string]any{
			"issuer": issuer, "authorization_endpoint": issuer + "/authorize",
			"token_endpoint": issuer + "/token", "jwks_uri": issuer + "/keys",
			"id_token_signing_alg_values_supported": []string{"RS256"},
		})
	})
	mux.HandleFunc("/keys", func(w http.ResponseWriter, _ *http.Request) {
		json.NewEncoder(w).Encode(jose.JSONWebKeySet{Keys: []jose.JSONWebKey{
			{Key: &key.PublicKey, KeyID: "test-key", Algorithm: "RS256"},
		}})
	})
	mux.HandleFunc("/token", func(w http.ResponseWriter, r *http.Request) {
		hash := sha256.Sum256([]byte(r.FormValue("code_verifier")))
		if base64.RawURLEncoding.EncodeToString(hash[:]) != challenge ||
			r.FormValue("redirect_uri") != origin+ssoPath+"/callback" {
			http.Error(w, "invalid exchange", http.StatusBadRequest)
			return
		}
		id := jwt.NewWithClaims(jwt.SigningMethodRS256, jwt.MapClaims{
			"iss": issuer, "sub": subject, "aud": "clims", "nonce": nonce,
			"iat": time.Now().Unix(), "exp": time.Now().Add(time.Minute).Unix(),
			"clims_roles": roles,
		})
		id.Header["kid"] = "test-key"
		raw, err := id.SignedString(key)
		if err != nil {
			http.Error(w, "sign token", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"id_token": raw, "access_token": "test", "token_type": "Bearer"})
	})
	idp := httptest.NewServer(mux)
	defer idp.Close()
	issuer = idp.URL

	linked := &users.User{ID: "6f1c2a7e-0000-4000-8000-000000000001", Status: "active", Roles: []rbac.Role{{Name: "DCFP"}}}
	fixture := &ssoFixture{subject: subject, sessions: map[string]string{}}
	sso, err := NewSSO(context.Background(), issuer, "clims", "client-secret", origin, "test-secret", fixture)
	if err != nil {
		t.Fatal(err)
	}
	app := fiber.New()
	sso.Register(app)

	send := func(req *http.Request, status int) *http.Response {
		t.Helper()
		res, err := app.Test(req)
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { res.Body.Close() })
		if res.StatusCode != status {
			t.Fatalf("%s %s returned %d, want %d", req.Method, req.URL.Path, res.StatusCode, status)
		}
		return res
	}
	findCookie := func(res *http.Response, name string) *http.Cookie {
		t.Helper()
		for _, cookie := range res.Cookies() {
			if cookie.Name == name && cookie.Value != "" {
				return cookie
			}
		}
		t.Fatalf("missing %s cookie", name)
		return nil
	}
	// signIn runs start and callback and returns where the callback sent the browser.
	signIn := func() *http.Response {
		t.Helper()
		res := send(httptest.NewRequest("GET", origin+ssoPath+"/start", nil), 303)
		loc, err := res.Location()
		if err != nil {
			t.Fatal(err)
		}
		query := loc.Query()
		nonce, challenge = query.Get("nonce"), query.Get("code_challenge")
		if nonce == "" || nonce == query.Get("state") || challenge == "" || query.Get("code_challenge_method") != "S256" {
			t.Fatal("missing nonce or PKCE")
		}
		req := httptest.NewRequest("GET", origin+ssoPath+"/callback?code=test&state="+url.QueryEscape(query.Get("state")), nil)
		req.AddCookie(findCookie(res, flowCookie))
		return send(req, 303)
	}
	exchange := func(cookie *http.Cookie, requestOrigin string, status int) *http.Response {
		t.Helper()
		req := httptest.NewRequest("POST", origin+ssoPath+"/exchange", nil)
		req.Header.Set("Origin", requestOrigin)
		if cookie != nil {
			req.AddCookie(cookie)
		}
		return send(req, status)
	}
	expectDenied := func(t *testing.T, reason string) {
		t.Helper()
		res := signIn()
		if loc := res.Header.Get("Location"); loc != origin+"/sign-in?sso_error="+reason {
			t.Fatalf("redirected to %q, want sign-in with %s", loc, reason)
		}
		for _, cookie := range res.Cookies() {
			if cookie.Name == handoffCookie && cookie.Value != "" {
				t.Fatal("denied sign-in must not hand off a session")
			}
		}
	}

	t.Run("linked user with access role", func(t *testing.T) {
		fixture.user, roles = linked, []string{accessRole}
		res := signIn()
		if loc := res.Header.Get("Location"); loc != origin+completePath {
			t.Fatalf("redirected to %q", loc)
		}
		handoff := findCookie(res, handoffCookie)
		if !handoff.HttpOnly || !handoff.Secure || handoff.Path != ssoPath+"/exchange" || handoff.MaxAge != handoffLifetime {
			t.Fatalf("handoff cookie is not confined: %+v", handoff)
		}
		exchange(handoff, "https://attacker.example", 403)
		var body struct {
			Data struct {
				Token        string     `json:"token"`
				RefreshToken string     `json:"refresh_token"`
				User         users.User `json:"user"`
			} `json:"data"`
		}
		if err := json.NewDecoder(exchange(handoff, origin, 200).Body).Decode(&body); err != nil {
			t.Fatal(err)
		}
		if body.Data.Token == "" || body.Data.RefreshToken == "" || body.Data.RefreshToken == handoff.Value || body.Data.User.ID != linked.ID {
			t.Fatalf("exchange did not return the linked user's session: %+v", body.Data)
		}
		claims := jwt.MapClaims{}
		if _, err := jwt.ParseWithClaims(body.Data.Token, claims, func(*jwt.Token) (any, error) { return []byte("test-secret"), nil }); err != nil ||
			claims["sub"] != linked.ID || claims["sid"] != "session-1" {
			t.Fatalf("access token is not a CLIMS session token: %v %v", claims, err)
		}
		exchange(handoff, origin, 401) // the handoff works once
	})
	t.Run("missing access role", func(t *testing.T) {
		fixture.user, roles = linked, []string{"other_role"}
		expectDenied(t, "denied")
	})
	t.Run("unlinked user", func(t *testing.T) {
		fixture.user, roles = nil, []string{accessRole}
		expectDenied(t, "unavailable")
	})
	t.Run("disabled account", func(t *testing.T) {
		disabled := *linked
		disabled.Status = "inactive"
		fixture.user, roles = &disabled, []string{accessRole}
		expectDenied(t, "unavailable")
	})
	t.Run("account without a CLIMS role", func(t *testing.T) {
		roleless := *linked
		roleless.Roles = nil
		fixture.user, roles = &roleless, []string{accessRole}
		expectDenied(t, "unavailable")
	})
	t.Run("callback without the flow cookie", func(t *testing.T) {
		res := send(httptest.NewRequest("GET", origin+ssoPath+"/callback?code=test&state=x", nil), 303)
		if loc := res.Header.Get("Location"); loc != origin+"/sign-in?sso_error=invalid" {
			t.Fatalf("redirected to %q", loc)
		}
	})
	t.Run("exchange without a handoff", func(t *testing.T) {
		exchange(nil, origin, 401)
	})
}

func TestNewSSORejectsUnsafeOrigins(t *testing.T) {
	for _, origin := range []string{"http://clims.example.org", "https://clims.example.org/", "https://clims.example.org/app"} {
		if _, err := NewSSO(context.Background(), "https://idp.example.org/realms/moh", "clims", "secret", origin, "s", nil); err == nil {
			t.Errorf("accepted public origin %q", origin)
		}
	}
}
