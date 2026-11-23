package auth

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/go-jose/go-jose/v4"
	"github.com/gofiber/fiber/v3"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"clims-backend/internal/features/rbac"
	"clims-backend/internal/features/users"
)

const (
	syncClient = "clims-identity-sync"
	syncSecret = "test-jwt-secret"
)

// testIdP is a Keycloak stand-in: discovery, keys, and an authorization-code token endpoint.
type testIdP struct {
	key    *rsa.PrivateKey
	issuer string
	// Set by the test before each sign-in; the token endpoint puts them in the ID token.
	subject, nonce, challenge, redirect string
	roles                               []string
	// editIDToken, when set, changes the ID token's claims; signingKey, when set, signs it instead.
	editIDToken func(jwt.MapClaims)
	signingKey  *rsa.PrivateKey
}

func newTestIdP(t *testing.T) *testIdP {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	idp := &testIdP{key: key}
	mux := http.NewServeMux()
	mux.HandleFunc("/.well-known/openid-configuration", func(w http.ResponseWriter, _ *http.Request) {
		json.NewEncoder(w).Encode(map[string]any{
			"issuer": idp.issuer, "authorization_endpoint": idp.issuer + "/authorize",
			"token_endpoint": idp.issuer + "/token", "jwks_uri": idp.issuer + "/keys",
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
		if base64.RawURLEncoding.EncodeToString(hash[:]) != idp.challenge || r.FormValue("redirect_uri") != idp.redirect {
			http.Error(w, "invalid exchange", http.StatusBadRequest)
			return
		}
		claims := jwt.MapClaims{
			"iss": idp.issuer, "sub": idp.subject, "aud": "clims", "azp": "clims", "nonce": idp.nonce,
			"iat": time.Now().Unix(), "exp": time.Now().Add(time.Minute).Unix(), "clims_roles": idp.roles,
		}
		if idp.editIDToken != nil {
			idp.editIDToken(claims)
		}
		key := idp.key
		if idp.signingKey != nil {
			key = idp.signingKey
		}
		raw := idp.sign(t, key, claims)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"id_token": raw, "access_token": "test", "token_type": "Bearer"})
	})
	// The issuer must be HTTPS for identity sync.
	server := httptest.NewTLSServer(mux)
	t.Cleanup(server.Close)
	idp.issuer = server.URL
	// Discovery runs through the default client; trust the test server's certificate for this test.
	previous := http.DefaultTransport
	http.DefaultTransport = server.Client().Transport
	t.Cleanup(func() { http.DefaultTransport = previous })
	return idp
}

func (p *testIdP) sign(t *testing.T, key *rsa.PrivateKey, claims jwt.MapClaims) string {
	t.Helper()
	token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	token.Header["kid"] = "test-key"
	raw, err := token.SignedString(key)
	if err != nil {
		t.Fatal(err)
	}
	return raw
}

// serviceToken is a client-credentials access token as Keycloak issues it to the sync client.
func (p *testIdP) serviceToken(t *testing.T, edit func(jwt.MapClaims)) string {
	t.Helper()
	now := time.Now()
	claims := jwt.MapClaims{
		"iss": p.issuer, "sub": "service-account-id", "aud": []string{"clims", "account"}, "typ": "Bearer", "azp": syncClient,
		"iat": now.Unix(), "nbf": now.Add(-time.Second).Unix(), "exp": now.Add(5 * time.Minute).Unix(),
		"resource_access": map[string]any{"clims": map[string]any{"roles": []string{"identity_sync"}}},
	}
	if edit != nil {
		edit(claims)
	}
	return p.sign(t, p.key, claims)
}

type fakeSession struct {
	userID, refresh string
	revoked         bool
}

// fakeAccounts models the users repository: eligible accounts, links and sessions.
type fakeAccounts struct {
	mu       sync.Mutex
	users    map[string]*users.User // by ID
	links    map[string]string      // subject -> user ID, for the configured issuer
	sessions map[string]*fakeSession
	// revokedAt is when identity sync last revoked each account's sessions, by user ID.
	revokedAt map[string]time.Time
	failList  bool
	// afterFind, when set, runs after FindByOIDCIdentity returns, outside the lock: a test uses it to
	// revoke while a sign-in is between the account lookup and creating its session.
	afterFind func()
}

func newFakeAccounts() *fakeAccounts {
	return &fakeAccounts{users: map[string]*users.User{}, links: map[string]string{}, sessions: map[string]*fakeSession{},
		revokedAt: map[string]time.Time{}}
}

func (f *fakeAccounts) add(id, status string, roles ...string) *users.User {
	u := &users.User{ID: id, Email: id[:8] + "@example.org", Status: status}
	for _, name := range roles {
		u.Roles = append(u.Roles, rbac.Role{Name: name})
	}
	f.users[id] = u
	return u
}

func (f *fakeAccounts) eligible(u *users.User) bool {
	return u != nil && u.Status == "active" && len(u.Roles) > 0
}

func (f *fakeAccounts) ListIdentitySyncAccounts(_ context.Context, _ string, after *uuid.UUID, limit int) ([]users.IdentitySyncAccount, bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.failList {
		return nil, false, errors.New("database unavailable")
	}
	var ids []string
	for id, u := range f.users {
		if f.eligible(u) && (after == nil || id > after.String()) {
			ids = append(ids, id)
		}
	}
	slices.Sort(ids)
	var out []users.IdentitySyncAccount
	for _, id := range ids {
		account := users.IdentitySyncAccount{ID: uuid.MustParse(id), Email: f.users[id].Email}
		for subject, linked := range f.links {
			if linked == id {
				account.LinkSubject = &subject
			}
		}
		out = append(out, account)
	}
	if len(out) > limit {
		return out[:limit], true, nil
	}
	return out, false, nil
}

func (f *fakeAccounts) LinkOIDCIdentity(_ context.Context, id uuid.UUID, _, subject string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if !f.eligible(f.users[id.String()]) {
		return users.ErrIdentityAccountIneligible
	}
	if linked, ok := f.links[subject]; ok {
		if linked == id.String() {
			return nil
		}
		return users.ErrIdentityLinkConflict
	}
	for _, linked := range f.links {
		if linked == id.String() {
			return users.ErrIdentityLinkConflict
		}
	}
	f.links[subject] = id.String()
	return nil
}

func (f *fakeAccounts) RevokeOIDCSessions(_ context.Context, _, subject string) (int64, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	var n int64
	if userID, ok := f.links[subject]; ok {
		f.revokedAt[userID] = time.Now()
	}
	for _, s := range f.sessions {
		if userID, ok := f.links[subject]; ok && s.userID == userID && !s.revoked {
			s.revoked = true
			n++
		}
	}
	return n, nil
}

func (f *fakeAccounts) FindByOIDCIdentity(_ context.Context, _, subject string) (*users.User, error) {
	if f.afterFind != nil {
		defer f.afterFind()
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	if id, ok := f.links[subject]; ok {
		return f.users[id], nil
	}
	return nil, pgx.ErrNoRows
}

// CreateOIDCSession models the repository: the linked account must be eligible, and a token issued at
// or before the account's last revoke is refused.
func (f *fakeAccounts) CreateOIDCSession(_ context.Context, _, subject string, issuedAt *time.Time, _, _ string) (users.IssuedSession, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	userID, ok := f.links[subject]
	if !ok || !f.eligible(f.users[userID]) {
		return users.IssuedSession{}, users.ErrIdentityAccountIneligible
	}
	at := time.Now()
	if issuedAt != nil {
		at = *issuedAt
	}
	if revoked, ok := f.revokedAt[userID]; ok && !revoked.Before(at) {
		return users.IssuedSession{}, users.ErrSignInRevoked
	}
	id, refresh := uuid.NewString(), newFlowValue()
	f.sessions[id] = &fakeSession{userID: userID, refresh: refresh}
	return users.IssuedSession{ID: id, UserID: userID, RefreshToken: refresh, ExpiresAt: time.Now().Add(time.Hour)}, nil
}

func (f *fakeAccounts) RefreshSession(_ context.Context, token string) (users.IssuedSession, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	for id, s := range f.sessions {
		if s.refresh == token && token != "" {
			if s.revoked {
				return users.IssuedSession{}, users.ErrRefreshInvalid
			}
			s.refresh = newFlowValue()
			return users.IssuedSession{ID: id, UserID: s.userID, RefreshToken: s.refresh, ExpiresAt: time.Now().Add(time.Hour)}, nil
		}
	}
	return users.IssuedSession{}, users.ErrRefreshInvalid
}

func (f *fakeAccounts) GetUserByID(_ context.Context, id string) (*users.User, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if u, ok := f.users[id]; ok {
		return u, nil
	}
	return nil, pgx.ErrNoRows
}

func (f *fakeAccounts) SessionActive(_ context.Context, userID, sessionID string) (bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	s, ok := f.sessions[sessionID]
	return ok && s.userID == userID && !s.revoked, nil
}

type syncHarness struct {
	t     *testing.T
	app   *fiber.App
	idp   *testIdP
	repo  *fakeAccounts
	token string
}

func newSyncHarness(t *testing.T, probe bool) *syncHarness {
	t.Helper()
	idp := newTestIdP(t)
	repo := newFakeAccounts()
	app := fiber.New()
	err := RegisterIdentitySync(context.Background(), app, repo, IdentitySyncConfig{
		Issuer: idp.issuer, ServiceClient: syncClient, TestProbe: probe, JWTSecret: syncSecret,
	})
	if err != nil {
		t.Fatal(err)
	}
	return &syncHarness{t: t, app: app, idp: idp, repo: repo, token: idp.serviceToken(t, nil)}
}

// do sends a request with the given bearer token ("" for none) and checks the status and no-store.
func (h *syncHarness) do(method, path, token, body string, status int, headers ...string) []byte {
	h.t.Helper()
	var reader io.Reader
	if body != "" {
		reader = strings.NewReader(body)
	}
	req := httptest.NewRequest(method, "https://clims.example.org"+identitySyncPath+path, reader)
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	// Add, not Set, so a test can repeat a header.
	for i := 0; i+1 < len(headers); i += 2 {
		req.Header.Add(headers[i], headers[i+1])
	}
	res, err := h.app.Test(req)
	if err != nil {
		h.t.Fatal(err)
	}
	defer res.Body.Close()
	data, _ := io.ReadAll(res.Body)
	if res.StatusCode != status {
		h.t.Fatalf("%s %s returned %d, want %d: %s", method, path, res.StatusCode, status, data)
	}
	if res.Header.Get("Cache-Control") != "no-store" {
		h.t.Fatalf("%s %s: Cache-Control %q, want no-store", method, path, res.Header.Get("Cache-Control"))
	}
	if loc := res.Header.Get("Location"); loc != "" {
		h.t.Fatalf("%s %s redirected to %q", method, path, loc)
	}
	return data
}

func (h *syncHarness) identity(subject string) string {
	body, _ := json.Marshal(map[string]string{"issuer": h.idp.issuer, "subject": subject})
	return string(body)
}

func TestIdentitySyncAuthorization(t *testing.T) {
	h := newSyncHarness(t, false)
	otherKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	h.do("GET", "/", "", "", 401)
	for name, token := range map[string]string{
		"bad signature": h.idp.sign(t, otherKey, jwt.MapClaims{"iss": h.idp.issuer, "sub": "x", "aud": "clims",
			"typ": "Bearer", "azp": syncClient, "exp": time.Now().Add(time.Minute).Unix()}),
		"expired":     h.idp.serviceToken(t, func(c jwt.MapClaims) { c["exp"] = time.Now().Add(-10 * time.Minute).Unix() }),
		"not yet":     h.idp.serviceToken(t, func(c jwt.MapClaims) { c["nbf"] = time.Now().Add(time.Hour).Unix() }),
		"wrong iss":   h.idp.serviceToken(t, func(c jwt.MapClaims) { c["iss"] = "https://other.example.org/realms/moh" }),
		"wrong aud":   h.idp.serviceToken(t, func(c jwt.MapClaims) { c["aud"] = []string{"account", "poesgo"} }),
		"not a token": "not-a-jwt",
	} {
		t.Run(name+" is 401", func(t *testing.T) { h.do("GET", "/", token, "", 401) })
	}
	for name, token := range map[string]string{
		"ID token":           h.idp.serviceToken(t, func(c jwt.MapClaims) { c["typ"] = "ID" }),
		"interactive client": h.idp.serviceToken(t, func(c jwt.MapClaims) { c["azp"] = "clims" }),
		"another client":     h.idp.serviceToken(t, func(c jwt.MapClaims) { c["azp"] = "poesgo-identity-sync" }),
		"missing role":       h.idp.serviceToken(t, func(c jwt.MapClaims) { delete(c, "resource_access") }),
		"role on other client": h.idp.serviceToken(t, func(c jwt.MapClaims) {
			c["resource_access"] = map[string]any{"poesgo": map[string]any{"roles": []string{"identity_sync"}}}
		}),
	} {
		t.Run(name+" is 403", func(t *testing.T) { h.do("GET", "/accounts", token, "", 403) })
	}
	t.Run("a cookie is not a credential", func(t *testing.T) {
		h.do("GET", "/", "", "", 401, "Cookie", "clims_sso_handoff=anything")
	})
	t.Run("unknown paths do not exist", func(t *testing.T) {
		h.do("GET", "/test/sessions/check", h.token, "", 404)
		h.do("POST", "/test/sessions", h.token, h.identity("s"), 404)
	})
}

func TestIdentitySyncDescriptor(t *testing.T) {
	h := newSyncHarness(t, false)
	for _, path := range []string{"", "/"} {
		var d map[string]any
		if err := json.Unmarshal(h.do("GET", path, h.token, "", 200), &d); err != nil {
			t.Fatal(err)
		}
		caps, _ := d["capabilities"].([]any)
		if d["contract"] != "moh-identity-sync" || d["version"] != "1.1" || d["application"] != "clims" ||
			d["accountIdFormat"] != "uuid" || d["maxPageSize"] != float64(100) || len(caps) != 3 || caps[2] != "sessions.revoke" {
			t.Fatalf("descriptor %q: %v", path, d)
		}
	}
}

func TestIdentitySyncAccounts(t *testing.T) {
	h := newSyncHarness(t, false)
	var eligible []string
	for range 7 {
		id := uuid.NewString()
		h.repo.add(id, "active", "DCFP")
		eligible = append(eligible, id)
	}
	slices.Sort(eligible)
	h.repo.add(uuid.NewString(), "inactive", "DCFP")
	h.repo.add(uuid.NewString(), "active")
	h.repo.links["linked-subject"] = eligible[2]

	type page struct {
		Accounts []struct {
			ID    string `json:"id"`
			Email string `json:"email"`
			Link  *struct {
				Issuer  string `json:"issuer"`
				Subject string `json:"subject"`
			} `json:"link"`
		} `json:"accounts"`
		NextCursor *string `json:"nextCursor"`
	}
	for _, limit := range []string{"1", "3", "7", "100", ""} {
		t.Run("walk with limit "+limit, func(t *testing.T) {
			var seen []string
			cursor := ""
			for range 20 {
				query := url.Values{}
				if limit != "" {
					query.Set("limit", limit)
				}
				if cursor != "" {
					query.Set("after", cursor)
				}
				var p page
				raw := h.do("GET", "/accounts?"+query.Encode(), h.token, "", 200)
				if err := json.Unmarshal(raw, &p); err != nil || p.NextCursor == nil {
					t.Fatalf("page %s: %v", raw, err)
				}
				if !strings.Contains(string(raw), `"link":`) {
					t.Fatalf("accounts must carry link, even when null: %s", raw)
				}
				for _, a := range p.Accounts {
					seen = append(seen, a.ID)
					if a.ID == eligible[2] {
						if a.Link == nil || a.Link.Issuer != h.idp.issuer || a.Link.Subject != "linked-subject" {
							t.Fatalf("linked account shows link %+v", a.Link)
						}
					} else if a.Link != nil {
						t.Fatalf("unlinked account shows link %+v", a.Link)
					}
				}
				if cursor = *p.NextCursor; cursor == "" {
					break
				}
			}
			if !slices.Equal(seen, eligible) {
				t.Fatalf("walk saw %v, want %v", seen, eligible)
			}
		})
	}
	for _, query := range []string{"limit=0", "limit=101", "limit=abc", "limit=-1", "limit=", "limit=1.5", "limit=+5",
		"after=not-a-uuid", "after=00000000-0000-0000-0000-000000000000", "after=" + strings.ToUpper(eligible[0])} {
		t.Run(query+" is 400", func(t *testing.T) { h.do("GET", "/accounts?"+query, h.token, "", 400) })
	}
	t.Run("a database failure is retryable", func(t *testing.T) {
		h.repo.failList = true
		defer func() { h.repo.failList = false }()
		h.do("GET", "/accounts", h.token, "", 503)
	})
}

func TestIdentitySyncLink(t *testing.T) {
	h := newSyncHarness(t, false)
	a, b, disabled := uuid.NewString(), uuid.NewString(), uuid.NewString()
	h.repo.add(a, "active", "DCFP")
	h.repo.add(b, "active", "DCFP")
	h.repo.add(disabled, "inactive", "DCFP")
	path := "/accounts/" + a + "/identity"
	h.do("PUT", path, h.token, h.identity("subject-a"), 204)
	h.do("PUT", path, h.token, h.identity("subject-a"), 204)
	h.do("PUT", path, h.token, h.identity("subject-other"), 409)
	h.do("PUT", "/accounts/"+b+"/identity", h.token, h.identity("subject-a"), 409)
	h.do("PUT", "/accounts/"+disabled+"/identity", h.token, h.identity("subject-d"), 404)
	h.do("PUT", "/accounts/"+uuid.NewString()+"/identity", h.token, h.identity("subject-x"), 404)
	for name, body := range map[string]string{
		"wrong issuer":   `{"issuer":"https://other.example.org/realms/moh","subject":"s"}`,
		"empty subject":  h.identity(""),
		"padded subject": h.identity(" s"),
		"long subject":   h.identity(strings.Repeat("s", 256)),
		"unknown field":  `{"issuer":"` + h.idp.issuer + `","subject":"s","extra":1}`,
		"trailing data":  h.identity("s") + `{}`,
		"not JSON":       `issuer=x`,
		"oversized":      `{"issuer":"` + h.idp.issuer + `","subject":"s","pad":"` + strings.Repeat("x", 5000) + `"}`,
	} {
		t.Run(name+" is 400", func(t *testing.T) { h.do("PUT", "/accounts/"+b+"/identity", h.token, body, 400) })
	}
	// The body is validated first; then an ID that cannot name an account is a missing account.
	for _, id := range []string{"not-a-uuid", "00000000-0000-0000-0000-000000000000", strings.ToUpper(b), "123"} {
		h.do("PUT", "/accounts/"+id+"/identity", h.token, h.identity("s"), 404)
		h.do("PUT", "/accounts/"+id+"/identity", h.token, h.identity(""), 400)
	}
	if h.repo.links["subject-a"] != a || len(h.repo.links) != 1 {
		t.Fatalf("links changed: %v", h.repo.links)
	}
}

func TestIdentitySyncRevokeAndProbe(t *testing.T) {
	h := newSyncHarness(t, true)
	a, other := uuid.NewString(), uuid.NewString()
	h.repo.add(a, "active", "DCFP")
	h.repo.add(other, "active", "DCFP")
	h.repo.links["subject-a"] = a
	h.repo.links["subject-other"] = other

	newSession := func(subject string) string {
		t.Helper()
		var body struct {
			SessionToken string `json:"sessionToken"`
		}
		if err := json.Unmarshal(h.do("POST", "/test/sessions", h.token, h.identity(subject), 201), &body); err != nil || body.SessionToken == "" {
			t.Fatalf("probe session: %v", err)
		}
		return body.SessionToken
	}
	check := func(token string, status int) {
		t.Helper()
		h.do("GET", "/test/sessions/check", h.token, "", status, testSessionHeader, token)
	}
	first, second, bystander := newSession("subject-a"), newSession("subject-a"), newSession("subject-other")
	check(first, 200)
	check(second, 200)

	h.do("POST", "/sessions/revoke", h.token, h.identity("subject-a"), 204)
	check(first, 401)
	check(second, 401)
	check(bystander, 200)
	if h.repo.links["subject-a"] != a {
		t.Fatal("revoke must keep the link")
	}
	h.do("POST", "/sessions/revoke", h.token, h.identity("subject-a"), 204)
	h.do("POST", "/sessions/revoke", h.token, h.identity("never-linked"), 204)
	h.do("POST", "/sessions/revoke", h.token, `{"issuer":"https://other.example.org/realms/moh","subject":"subject-a"}`, 400)
	h.do("POST", "/sessions/revoke", h.token, `{}`, 400)
	check(newSession("subject-a"), 200) // signing in again after a revoke works while access remains

	h.do("POST", "/test/sessions", h.token, h.identity("never-linked"), 404)
	// A missing, empty or repeated X-Test-Session header is a malformed request (contract appendix).
	h.do("GET", "/test/sessions/check", h.token, "", 400)
	check("", 400)
	h.do("GET", "/test/sessions/check", h.token, "", 400, testSessionHeader, bystander, testSessionHeader, bystander)
	check("garbage", 401)
	forged, _ := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{"sub": a, "sid": uuid.NewString(),
		"exp": time.Now().Add(time.Minute).Unix()}).SignedString([]byte("another-secret"))
	check(forged, 401)
	// The probe needs the sync client's token like every other identity-sync endpoint.
	h.do("POST", "/test/sessions", "", h.identity("subject-a"), 401)
	h.do("GET", "/test/sessions/check", h.idp.serviceToken(t, func(c jwt.MapClaims) { c["azp"] = "clims" }), "", 403, testSessionHeader, first)
}

// TestRevokeEndsPortalSession signs in through the portal and then revokes: the handoff, the access
// token and the refresh token all stop working, and the next portal sign-in still needs the role.
func TestRevokeEndsPortalSession(t *testing.T) {
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

	send := func(req *http.Request) *http.Response {
		t.Helper()
		res, err := h.app.Test(req)
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
	signIn := func() *http.Response {
		t.Helper()
		start := send(httptest.NewRequest("GET", origin+ssoPath+"/start", nil))
		loc, err := start.Location()
		if err != nil {
			t.Fatal(err)
		}
		h.idp.nonce, h.idp.challenge = loc.Query().Get("nonce"), loc.Query().Get("code_challenge")
		req := httptest.NewRequest("GET", origin+ssoPath+"/callback?code=c&state="+url.QueryEscape(loc.Query().Get("state")), nil)
		req.AddCookie(cookie(start, flowCookie))
		return send(req)
	}
	exchange := func(handoff *http.Cookie) (int, map[string]any) {
		t.Helper()
		req := httptest.NewRequest("POST", origin+ssoPath+"/exchange", nil)
		req.Header.Set("Origin", origin)
		req.AddCookie(handoff)
		res := send(req)
		var body struct {
			Data map[string]any `json:"data"`
		}
		json.NewDecoder(res.Body).Decode(&body)
		return res.StatusCode, body.Data
	}

	// A completed sign-in: its access token passes the session check until the revoke.
	handoff := cookie(signIn(), handoffCookie)
	if handoff == nil {
		t.Fatal("sign-in did not hand off a session")
	}
	status, tokens := exchange(handoff)
	if status != 200 {
		t.Fatalf("exchange returned %d", status)
	}
	access, _ := tokens["token"].(string)
	refresh, _ := tokens["refresh_token"].(string)
	h.do("GET", "/test/sessions/check", h.token, "", 200, testSessionHeader, access)

	// A sign-in whose handoff the browser has not claimed yet.
	pending := cookie(signIn(), handoffCookie)
	if pending == nil {
		t.Fatal("second sign-in did not hand off a session")
	}

	h.do("POST", "/sessions/revoke", h.token, h.identity("portal-user"), 204)
	h.do("GET", "/test/sessions/check", h.token, "", 401, testSessionHeader, access)
	if _, err := h.repo.RefreshSession(context.Background(), refresh); !errors.Is(err, users.ErrRefreshInvalid) {
		t.Fatalf("refresh after revoke: %v", err)
	}
	if status, _ := exchange(pending); status != 401 {
		t.Fatalf("pending handoff after revoke returned %d, want 401", status)
	}

	// Keycloak has removed the access role, so the next sign-in is refused without a session.
	h.idp.roles = nil
	res := signIn()
	if loc := res.Header.Get("Location"); loc != origin+"/sign-in?sso_error=denied" || cookie(res, handoffCookie) != nil {
		t.Fatalf("sign-in without the role went to %q", loc)
	}
}

// TestProbeRefusesIneligibleAccounts: the probe starts a session only where the portal callback
// would, so a linked account that is disabled or has no role gets 404 and no session.
func TestProbeRefusesIneligibleAccounts(t *testing.T) {
	h := newSyncHarness(t, true)
	disabled, roleless := uuid.NewString(), uuid.NewString()
	h.repo.add(disabled, "inactive", "DCFP")
	h.repo.add(roleless, "active")
	h.repo.links["subject-disabled"], h.repo.links["subject-roleless"] = disabled, roleless
	for _, subject := range []string{"subject-disabled", "subject-roleless"} {
		h.do("POST", "/test/sessions", h.token, h.identity(subject), 404)
	}
	if len(h.repo.sessions) != 0 {
		t.Fatalf("the probe created %d sessions for ineligible accounts", len(h.repo.sessions))
	}
}

// TestIdentitySyncAudienceFollowsClientID: the audience, the client-role key and the descriptor's
// application all come from CLIMS's own Keycloak client ID (OIDC_CLIENT_ID), not a fixed "clims".
func TestIdentitySyncAudienceFollowsClientID(t *testing.T) {
	idp := newTestIdP(t)
	app := fiber.New()
	const audience = "clims-staging"
	err := RegisterIdentitySync(context.Background(), app, newFakeAccounts(), IdentitySyncConfig{
		Issuer: idp.issuer, Audience: audience, ServiceClient: syncClient, JWTSecret: syncSecret,
	})
	if err != nil {
		t.Fatal(err)
	}
	h := &syncHarness{t: t, app: app, idp: idp, repo: newFakeAccounts()}
	forAudience := func(c jwt.MapClaims) {
		c["aud"] = []string{audience, "account"}
		c["resource_access"] = map[string]any{audience: map[string]any{"roles": []string{"identity_sync"}}}
	}
	var d map[string]any
	if err := json.Unmarshal(h.do("GET", "/", idp.serviceToken(t, forAudience), "", 200), &d); err != nil {
		t.Fatal(err)
	}
	if d["application"] != audience {
		t.Fatalf("descriptor application %v, want %q", d["application"], audience)
	}
	// A token for the default "clims" client is for another audience here.
	h.do("GET", "/", idp.serviceToken(t, nil), "", 401)
	// The role must sit on this application's client.
	h.do("GET", "/", idp.serviceToken(t, func(c jwt.MapClaims) {
		forAudience(c)
		c["resource_access"] = map[string]any{"clims": map[string]any{"roles": []string{"identity_sync"}}}
	}), "", 403)
	// The service client can never be the interactive client itself.
	if err := RegisterIdentitySync(context.Background(), fiber.New(), newFakeAccounts(), IdentitySyncConfig{
		Issuer: idp.issuer, Audience: audience, ServiceClient: audience,
	}); err == nil {
		t.Fatal("accepted the interactive client as the service client")
	}
}
