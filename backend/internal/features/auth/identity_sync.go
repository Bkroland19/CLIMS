package auth

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/url"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"github.com/gofiber/fiber/v3"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"clims-backend/internal/features/users"
)

// The MoH identity-sync contract, version 1.1. The MoH SSO Dashboard calls these endpoints to link
// existing CLIMS accounts to Keycloak identities and to end their sessions when portal access is removed.
const (
	identitySyncPath     = "/api/v1/internal/identity-sync"
	identitySyncAudience = "clims"
	identitySyncRole     = "identity_sync"
	maxIdentitySyncBody  = 4 << 10
	// testSessionHeader carries the session token the test probe issued.
	testSessionHeader = "X-Test-Session"
)

// IdentitySyncAccounts is what the identity-sync endpoints need from the users repository.
type IdentitySyncAccounts interface {
	ListIdentitySyncAccounts(ctx context.Context, issuer string, after *uuid.UUID, limit int) ([]users.IdentitySyncAccount, bool, error)
	LinkOIDCIdentity(ctx context.Context, id uuid.UUID, issuer, subject string) error
	RevokeOIDCSessions(ctx context.Context, issuer, subject string) (int64, error)

	// The test session probe uses these to start and inspect real CLIMS sessions.
	FindByOIDCIdentity(ctx context.Context, issuer, subject string) (*users.User, error)
	CreateSession(ctx context.Context, userID, userAgent, ip string) (users.IssuedSession, error)
	GetUserByID(ctx context.Context, id string) (*users.User, error)
	SessionActive(ctx context.Context, userID, sessionID string) (bool, error)
}

// IdentitySyncConfig configures the identity-sync endpoints.
type IdentitySyncConfig struct {
	// Issuer is the public Keycloak realm issuer, exactly as it appears in iss.
	Issuer string
	// ServiceClient is the dashboard's dedicated client, such as clims-identity-sync.
	ServiceClient string
	// TestProbe adds the session probe routes the conformance suite uses. Turn it on only in a test
	// environment (IDENTITY_SYNC_TEST_PROBE=1); otherwise the routes do not exist.
	TestProbe bool
	// JWTSecret signs and checks the probe's session tokens, exactly as for a password login.
	JWTSecret string
}

// RegisterIdentitySync exposes the identity-sync contract to one dedicated Keycloak client.
func RegisterIdentitySync(ctx context.Context, app *fiber.App, repo IdentitySyncAccounts, cfg IdentitySyncConfig) error {
	u, err := url.Parse(cfg.Issuer)
	if err != nil || u.Scheme != "https" || u.Hostname() == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" ||
		cfg.ServiceClient == "" || cfg.ServiceClient == identitySyncAudience {
		return errors.New("CLIMS identity sync requires an HTTPS issuer and a dedicated service client")
	}
	if cfg.TestProbe && cfg.JWTSecret == "" {
		return errors.New("the identity-sync test probe needs the JWT secret")
	}
	provider, err := oidc.NewProvider(ctx, cfg.Issuer)
	if err != nil {
		return err
	}
	verifier := provider.Verifier(&oidc.Config{ClientID: identitySyncAudience, SupportedSigningAlgs: []string{oidc.RS256}})
	s := &identitySync{repo: repo, cfg: cfg}
	group := app.Group(identitySyncPath, s.authorize(verifier))
	group.Get("/", s.describe)
	group.Get("/accounts", s.listAccounts)
	group.Put("/accounts/:id/identity", s.link)
	group.Post("/sessions/revoke", s.revokeSessions)
	if cfg.TestProbe {
		group.Post("/test/sessions", s.probeCreate)
		group.Get("/test/sessions/check", s.probeCheck)
	}
	return nil
}

type identitySync struct {
	repo IdentitySyncAccounts
	cfg  IdentitySyncConfig
}

// syncError sends a contract status with the optional JSON error body. Messages never carry tokens
// or other accounts' data.
func syncError(c fiber.Ctx, status int, code string) error {
	if status == fiber.StatusServiceUnavailable {
		c.Set(fiber.HeaderRetryAfter, "5")
	}
	if code == "" {
		return c.SendStatus(status)
	}
	return c.Status(status).JSON(fiber.Map{"error": fiber.Map{"code": code}})
}

// authorize applies the contract's token checks: 401 when the token is missing or fails signature,
// issuer, lifetime or audience; 403 when it is valid but not the identity-sync client's.
func (s *identitySync) authorize(verifier *oidc.IDTokenVerifier) fiber.Handler {
	return func(c fiber.Ctx) error {
		c.Set(fiber.HeaderCacheControl, "no-store")
		scheme, token, found := strings.Cut(c.Get(fiber.HeaderAuthorization), " ")
		if !found || !strings.EqualFold(scheme, "Bearer") || token == "" {
			return syncError(c, fiber.StatusUnauthorized, "")
		}
		ctx, cancel := context.WithTimeout(c.Context(), 10*time.Second)
		defer cancel()
		verified, err := verifier.Verify(ctx, token)
		if err != nil {
			return syncError(c, fiber.StatusUnauthorized, "")
		}
		var claims struct {
			Type   string `json:"typ"`
			Client string `json:"azp"`
			Roles  map[string]struct {
				Roles []string `json:"roles"`
			} `json:"resource_access"`
		}
		if err := verified.Claims(&claims); err != nil || claims.Type != "Bearer" || claims.Client != s.cfg.ServiceClient ||
			!slices.Contains(claims.Roles[identitySyncAudience].Roles, identitySyncRole) {
			return syncError(c, fiber.StatusForbidden, "")
		}
		c.SetContext(ctx)
		return c.Next()
	}
}

func (s *identitySync) describe(c fiber.Ctx) error {
	capabilities := []string{"accounts.list", "identity.link", "sessions.revoke"}
	return c.JSON(fiber.Map{
		"contract": "moh-identity-sync", "version": "1.1", "application": identitySyncAudience,
		"accountIdFormat": "uuid", "maxPageSize": users.MaxIdentitySyncPage, "capabilities": capabilities,
	})
}

var pageLimitPattern = regexp.MustCompile(`^[0-9]{1,3}$`)

type syncLink struct {
	Issuer  string `json:"issuer"`
	Subject string `json:"subject"`
}

type syncAccount struct {
	ID    string    `json:"id"`
	Email string    `json:"email"`
	Link  *syncLink `json:"link"`
}

func (s *identitySync) listAccounts(c fiber.Ctx) error {
	var cursor *uuid.UUID
	if raw := c.Query("after"); raw != "" {
		id, err := uuid.Parse(raw)
		if err != nil || id == uuid.Nil || id.String() != raw {
			return syncError(c, fiber.StatusBadRequest, "invalid_request")
		}
		cursor = &id
	}
	limit := users.MaxIdentitySyncPage
	if raw, present := c.Queries()["limit"]; present {
		n, err := strconv.Atoi(raw)
		if !pageLimitPattern.MatchString(raw) || err != nil || n < 1 || n > users.MaxIdentitySyncPage {
			return syncError(c, fiber.StatusBadRequest, "invalid_request")
		}
		limit = n
	}
	rows, more, err := s.repo.ListIdentitySyncAccounts(c.Context(), s.cfg.Issuer, cursor, limit)
	if err != nil {
		return syncError(c, fiber.StatusServiceUnavailable, "unavailable")
	}
	accounts := make([]syncAccount, 0, len(rows))
	for _, row := range rows {
		account := syncAccount{ID: row.ID.String(), Email: row.Email}
		if row.LinkSubject != nil {
			account.Link = &syncLink{Issuer: s.cfg.Issuer, Subject: *row.LinkSubject}
		}
		accounts = append(accounts, account)
	}
	next := ""
	if more && len(accounts) > 0 {
		next = accounts[len(accounts)-1].ID
	}
	return c.JSON(fiber.Map{"accounts": accounts, "nextCursor": next})
}

// identityBody decodes {"issuer","subject"} and accepts only the configured issuer and a subject of
// 1-255 characters without surrounding spaces.
func (s *identitySync) identityBody(c fiber.Ctx) (syncLink, bool) {
	var body syncLink
	raw := c.Body()
	if len(raw) > maxIdentitySyncBody {
		return body, false
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if decoder.Decode(&body) != nil || decoder.Decode(&struct{}{}) != io.EOF {
		return body, false
	}
	subject := strings.TrimSpace(body.Subject)
	return body, body.Issuer == s.cfg.Issuer && subject != "" && subject == body.Subject && len(subject) <= 255
}

func (s *identitySync) link(c fiber.Ctx) error {
	raw := c.Params("id")
	id, err := uuid.Parse(raw)
	body, valid := s.identityBody(c)
	if err != nil || id == uuid.Nil || id.String() != raw || !valid {
		return syncError(c, fiber.StatusBadRequest, "invalid_request")
	}
	err = s.repo.LinkOIDCIdentity(c.Context(), id, s.cfg.Issuer, body.Subject)
	switch {
	case err == nil:
		return c.SendStatus(fiber.StatusNoContent)
	case errors.Is(err, users.ErrIdentityAccountIneligible):
		return syncError(c, fiber.StatusNotFound, "account_ineligible")
	case errors.Is(err, users.ErrIdentityLinkConflict):
		return syncError(c, fiber.StatusConflict, "link_conflict")
	default:
		return syncError(c, fiber.StatusServiceUnavailable, "unavailable")
	}
}

// revokeSessions ends every CLIMS session of the linked account. Each authenticated request checks
// its session in the database, so access tokens stop working at once and refresh tokens are refused.
func (s *identitySync) revokeSessions(c fiber.Ctx) error {
	body, valid := s.identityBody(c)
	if !valid {
		return syncError(c, fiber.StatusBadRequest, "invalid_request")
	}
	if _, err := s.repo.RevokeOIDCSessions(c.Context(), s.cfg.Issuer, body.Subject); err != nil {
		return syncError(c, fiber.StatusServiceUnavailable, "unavailable")
	}
	return c.SendStatus(fiber.StatusNoContent)
}

// probeCreate starts a real CLIMS session for the linked account, when the portal callback would
// sign it in (active, with a role), and returns its access token. Test environments only.
func (s *identitySync) probeCreate(c fiber.Ctx) error {
	body, valid := s.identityBody(c)
	if !valid {
		return syncError(c, fiber.StatusBadRequest, "invalid_request")
	}
	user, err := s.repo.FindByOIDCIdentity(c.Context(), s.cfg.Issuer, body.Subject)
	switch {
	case errors.Is(err, pgx.ErrNoRows):
		return syncError(c, fiber.StatusNotFound, "account_ineligible")
	case err != nil:
		return syncError(c, fiber.StatusServiceUnavailable, "unavailable")
	case !signInEligible(user):
		return syncError(c, fiber.StatusNotFound, "account_ineligible")
	}
	session, err := s.repo.CreateSession(c.Context(), user.ID, "identity-sync test probe", c.IP())
	if err != nil {
		return syncError(c, fiber.StatusServiceUnavailable, "unavailable")
	}
	tokens, err := signTokens(s.cfg.JWTSecret, session)
	if err != nil {
		return syncError(c, fiber.StatusServiceUnavailable, "unavailable")
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"sessionToken": tokens["token"]})
}

// probeCheck answers 200 while the probe's session would still authorize a CLIMS request, applying
// the same checks as the JWT middleware and users.ActiveUser, and 401 once it is revoked or expired.
// A missing, empty or repeated X-Test-Session header is 400.
func (s *identitySync) probeCheck(c fiber.Ctx) error {
	// Exactly one non-empty X-Test-Session header; anything else is a malformed request.
	values := c.Request().Header.PeekAll(testSessionHeader)
	if len(values) != 1 || len(values[0]) == 0 {
		return syncError(c, fiber.StatusBadRequest, "invalid_request")
	}
	claims := jwt.MapClaims{}
	_, err := jwt.ParseWithClaims(string(values[0]), claims, func(*jwt.Token) (any, error) {
		return []byte(s.cfg.JWTSecret), nil
	}, jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}), jwt.WithExpirationRequired())
	if err != nil {
		return syncError(c, fiber.StatusUnauthorized, "")
	}
	subject, _ := claims.GetSubject()
	sessionID, _ := claims["sid"].(string)
	if uuid.Validate(subject) != nil || uuid.Validate(sessionID) != nil {
		return syncError(c, fiber.StatusUnauthorized, "")
	}
	user, err := s.repo.GetUserByID(c.Context(), subject)
	switch {
	case errors.Is(err, pgx.ErrNoRows):
		return syncError(c, fiber.StatusUnauthorized, "")
	case err != nil:
		return syncError(c, fiber.StatusServiceUnavailable, "unavailable")
	case user.Status != "active":
		return syncError(c, fiber.StatusUnauthorized, "")
	}
	active, err := s.repo.SessionActive(c.Context(), subject, sessionID)
	switch {
	case err != nil:
		return syncError(c, fiber.StatusServiceUnavailable, "unavailable")
	case !active:
		return syncError(c, fiber.StatusUnauthorized, "")
	}
	return c.SendStatus(fiber.StatusOK)
}
