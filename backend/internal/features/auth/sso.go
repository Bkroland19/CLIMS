package auth

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"net/url"
	"slices"
	"strings"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5"
	"golang.org/x/oauth2"

	"clims-backend/internal/features/users"
	"clims-backend/internal/pkg/response"
)

const (
	ssoPath       = "/api/v1/auth/sso"
	flowCookie    = "clims_oidc"
	handoffCookie = "clims_sso_handoff"
	accessRole    = "clims_access"
	// The SPA claims the session within this window, or the user starts again from the portal.
	handoffLifetime = 60
)

// Pages in the SPA that the callback sends the browser to.
const (
	completePath = "/sso/complete"
	signInPath   = "/sign-in"
)

type ssoAccounts interface {
	FindByOIDCIdentity(context.Context, string, string) (*users.User, error)
	CreateSession(ctx context.Context, userID, userAgent, ip string) (users.IssuedSession, error)
	RefreshSession(context.Context, string) (users.IssuedSession, error)
	GetUserByID(context.Context, string) (*users.User, error)
}

// SSO signs portal users in to their linked CLIMS account.
//
// The callback starts an ordinary CLIMS session and hands its refresh token to the browser in an
// HttpOnly cookie that only the exchange endpoint receives. The SPA then calls the exchange, which
// rotates that refresh token, so the handoff works once and no token appears in a URL.
type SSO struct {
	oauth          oauth2.Config
	verifier       *oidc.IDTokenVerifier
	accounts       ssoAccounts
	jwtSecret      string
	issuer, origin string
	secure         bool
}

func NewSSO(ctx context.Context, issuer, clientID, secret, publicOrigin, jwtSecret string, accounts ssoAccounts) (*SSO, error) {
	origin, originErr := url.Parse(publicOrigin)
	idp, issuerErr := url.Parse(issuer)
	if clientID == "" || secret == "" || originErr != nil || issuerErr != nil ||
		!validSSOURL(origin) || !validSSOURL(idp) || origin.Path != "" || publicOrigin != origin.Scheme+"://"+origin.Host {
		return nil, errors.New("configure OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET and OIDC_PUBLIC_ORIGIN (scheme and host only)")
	}
	provider, err := oidc.NewProvider(ctx, issuer)
	if err != nil {
		return nil, fmt.Errorf("discover OIDC provider: %w", err)
	}
	return &SSO{
		oauth: oauth2.Config{ClientID: clientID, ClientSecret: secret, Endpoint: provider.Endpoint(),
			RedirectURL: publicOrigin + ssoPath + "/callback", Scopes: []string{oidc.ScopeOpenID}},
		verifier: provider.Verifier(&oidc.Config{ClientID: clientID}),
		accounts: accounts, jwtSecret: jwtSecret, issuer: issuer, origin: publicOrigin, secure: origin.Scheme == "https",
	}, nil
}

// validSSOURL accepts HTTPS, or plain HTTP on the local machine for development.
func validSSOURL(u *url.URL) bool {
	if u == nil || u.Hostname() == "" || u.User != nil || u.RawQuery != "" || u.ForceQuery || u.Fragment != "" {
		return false
	}
	return u.Scheme == "https" ||
		(u.Scheme == "http" && slices.Contains([]string{"localhost", "127.0.0.1", "::1"}, u.Hostname()))
}

func (s *SSO) Register(app *fiber.App) {
	g := app.Group(ssoPath, func(c fiber.Ctx) error {
		c.Set("Cache-Control", "no-store")
		c.Set("Referrer-Policy", "no-referrer")
		return c.Next()
	})
	g.Get("/start", s.start)
	g.Get("/callback", s.callback)
	g.Post("/exchange", authRateLimit(true), s.exchange)
}

func (s *SSO) cookie(c fiber.Ctx, name, value, path string, maxAge int) {
	cookie := &fiber.Cookie{Name: name, Value: value, Path: path, MaxAge: maxAge,
		Secure: s.secure, HTTPOnly: true, SameSite: fiber.CookieSameSiteLaxMode}
	if maxAge < 0 {
		cookie.MaxAge = 0
		cookie.Expires = time.Unix(1, 0).UTC()
	}
	c.Cookie(cookie)
}

func (s *SSO) start(c fiber.Ctx) error {
	state, nonce, verifier := newFlowValue(), newFlowValue(), oauth2.GenerateVerifier()
	s.cookie(c, flowCookie, state+"."+nonce+"."+verifier, ssoPath, 300)
	return c.Redirect().To(s.oauth.AuthCodeURL(state, oidc.Nonce(nonce), oauth2.S256ChallengeOption(verifier)))
}

func newFlowValue() string {
	var b [32]byte
	rand.Read(b[:])
	return base64.RawURLEncoding.EncodeToString(b[:])
}

// fail sends the browser to the sign-in page, which explains the reason without exposing details.
func (s *SSO) fail(c fiber.Ctx, reason string) error {
	return c.Redirect().To(s.origin + signInPath + "?" + url.Values{"sso_error": {reason}}.Encode())
}

func (s *SSO) callback(c fiber.Ctx) error {
	flow := strings.Split(c.Cookies(flowCookie), ".")
	s.cookie(c, flowCookie, "", ssoPath, -1)
	code := c.Query("code")
	if len(flow) != 3 || flow[0] == "" || flow[1] == "" || flow[2] == "" || code == "" || c.Query("error") != "" ||
		subtle.ConstantTimeCompare([]byte(flow[0]), []byte(c.Query("state"))) != 1 {
		return s.fail(c, "invalid")
	}
	ctx, cancel := context.WithTimeout(c.Context(), 10*time.Second)
	defer cancel()
	token, err := s.oauth.Exchange(ctx, code, oauth2.VerifierOption(flow[2]))
	if err != nil {
		return s.fail(c, "failed")
	}
	raw, _ := token.Extra("id_token").(string)
	id, err := s.verifier.Verify(ctx, raw)
	if err != nil || id.Subject == "" || id.Nonce != flow[1] {
		return s.fail(c, "invalid")
	}
	var claims struct {
		Roles           []string `json:"clims_roles"`
		AuthorizedParty string   `json:"azp"`
	}
	if err := id.Claims(&claims); err != nil ||
		(claims.AuthorizedParty != "" && claims.AuthorizedParty != s.oauth.ClientID) ||
		(len(id.Audience) > 1 && claims.AuthorizedParty != s.oauth.ClientID) ||
		!slices.Contains(claims.Roles, accessRole) {
		return s.fail(c, "denied")
	}
	// Only the link the reconciler recorded opens an account; email is never a fallback.
	user, err := s.accounts.FindByOIDCIdentity(ctx, s.issuer, id.Subject)
	switch {
	case errors.Is(err, pgx.ErrNoRows):
		return s.fail(c, "unavailable")
	case err != nil:
		return s.fail(c, "failed")
	}
	// The same accounts identity sync offers for linking: active, with at least one role.
	if user.Status != "active" || len(user.Roles) == 0 {
		return s.fail(c, "unavailable")
	}
	session, err := s.accounts.CreateSession(ctx, user.ID, c.Get(fiber.HeaderUserAgent), c.IP())
	if err != nil {
		return s.fail(c, "failed")
	}
	s.cookie(c, handoffCookie, session.RefreshToken, ssoPath+"/exchange", handoffLifetime)
	return c.Redirect().To(s.origin + completePath)
}

// exchange gives the SPA the session the callback started, in the same shape as a password login.
func (s *SSO) exchange(c fiber.Ctx) error {
	if c.Get("Origin") != s.origin {
		return response.Error(c, 403, "same-origin request required", nil)
	}
	refreshToken := c.Cookies(handoffCookie)
	s.cookie(c, handoffCookie, "", ssoPath+"/exchange", -1)
	if refreshToken == "" || len(refreshToken) > 128 {
		return response.Error(c, 401, "start sign-in again from the portal", nil)
	}
	session, err := s.accounts.RefreshSession(c.Context(), refreshToken)
	switch {
	case errors.Is(err, users.ErrRefreshInvalid):
		return response.Error(c, 401, "start sign-in again from the portal", nil)
	case errors.Is(err, users.ErrAccountDisabled):
		return response.Error(c, 403, err.Error(), nil)
	case err != nil:
		return response.Error(c, 500, "failed to start session", nil)
	}
	tokens, err := signTokens(s.jwtSecret, session)
	if err != nil {
		return response.Error(c, 500, "failed to generate token", nil)
	}
	user, err := s.accounts.GetUserByID(c.Context(), session.UserID)
	if err != nil {
		return response.Error(c, 500, "failed to load account", nil)
	}
	tokens["user"] = user
	return response.Success(c, 200, "login successful", tokens)
}
