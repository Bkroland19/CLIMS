package integration

import (
	"context"
	"errors"
	"fmt"
	"net/http/httptest"
	"net/url"
	"os"
	"testing"
	"time"

	"clims-backend/internal/database"
	"clims-backend/internal/features/users"
	"clims-backend/internal/middleware"

	"github.com/gofiber/fiber/v3"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// TestIdentitySyncRepository checks the contract 1.1 queries against PostgreSQL: each account's
// link, paging, and that revoking an identity's sessions ends them for every request path.
func TestIdentitySyncRepository(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set TEST_DATABASE_URL to a PostgreSQL instance with CREATE DATABASE permission")
	}
	ctx := context.Background()
	admin, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(admin.Close)
	name := fmt.Sprintf("clims_identity_sync_test_%d", time.Now().UnixNano())
	if _, err = admin.Exec(ctx, `CREATE DATABASE `+name); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if _, err := admin.Exec(ctx, `DROP DATABASE `+name+` WITH (FORCE)`); err != nil {
			t.Error(err)
		}
	})
	u, err := url.Parse(dsn)
	if err != nil {
		t.Fatal(err)
	}
	u.Path = "/" + name
	if err = database.RunMigrations(u.String()); err != nil {
		t.Fatal(err)
	}
	pool, err := pgxpool.New(ctx, u.String())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	repo := users.NewRepository(pool)

	var roleID string
	if err = pool.QueryRow(ctx, `SELECT id::text FROM roles ORDER BY id LIMIT 1`).Scan(&roleID); err != nil {
		t.Fatal(err)
	}
	newUser := func(username string, roles ...string) string {
		t.Helper()
		id, err := repo.CreateUserWithRoles(ctx, users.AccountInput{Username: username, Email: username + "@example.org"}, "x", roles)
		if err != nil {
			t.Fatal(err)
		}
		return id
	}
	const issuer, otherIssuer = "https://sso.example.org/realms/moh", "https://other.example.org/realms/moh"
	linked, unlinked, roleless := newUser("idsync-linked", roleID), newUser("idsync-unlinked", roleID), newUser("idsync-roleless")
	bystander := newUser("idsync-bystander", roleID)
	if err = repo.LinkOIDCIdentity(ctx, uuid.MustParse(linked), issuer, "subject-linked"); err != nil {
		t.Fatal(err)
	}
	if err = repo.LinkOIDCIdentity(ctx, uuid.MustParse(unlinked), otherIssuer, "subject-elsewhere"); err != nil {
		t.Fatal(err)
	}
	if err = repo.LinkOIDCIdentity(ctx, uuid.MustParse(bystander), issuer, "subject-bystander"); err != nil {
		t.Fatal(err)
	}
	if err = repo.LinkOIDCIdentity(ctx, uuid.MustParse(roleless), issuer, "s"); !errors.Is(err, users.ErrIdentityAccountIneligible) {
		t.Fatalf("roleless account linked: %v", err)
	}
	if err = repo.LinkOIDCIdentity(ctx, uuid.MustParse(linked), issuer, "subject-other"); !errors.Is(err, users.ErrIdentityLinkConflict) {
		t.Fatalf("second subject for one account: %v", err)
	}
	if err = repo.LinkOIDCIdentity(ctx, uuid.MustParse(unlinked), issuer, "subject-linked"); !errors.Is(err, users.ErrIdentityLinkConflict) {
		t.Fatalf("one subject on two accounts: %v", err)
	}

	t.Run("accounts carry their link for the configured issuer", func(t *testing.T) {
		all, more, err := repo.ListIdentitySyncAccounts(ctx, issuer, nil, 100)
		if err != nil || more {
			t.Fatalf("list: more=%v err=%v", more, err)
		}
		links := map[string]string{}
		var previous string
		for _, a := range all {
			if a.ID.String() <= previous {
				t.Fatal("accounts are not in ascending ID order")
			}
			previous = a.ID.String()
			if a.LinkSubject != nil {
				links[a.ID.String()] = *a.LinkSubject
			} else {
				links[a.ID.String()] = ""
			}
		}
		if links[linked] != "subject-linked" || links[bystander] != "subject-bystander" {
			t.Fatalf("missing links: %v", links)
		}
		if subject, listed := links[unlinked]; !listed || subject != "" {
			t.Fatalf("an account linked only for another issuer shows %q (listed %v)", subject, listed)
		}
		if _, listed := links[roleless]; listed {
			t.Fatal("an account without a role is listed")
		}
		// Paging one at a time sees the same accounts and the last page says so.
		var walked int
		var after *uuid.UUID
		for {
			page, more, err := repo.ListIdentitySyncAccounts(ctx, issuer, after, 1)
			if err != nil || len(page) > 1 {
				t.Fatalf("page: %v %v", page, err)
			}
			walked += len(page)
			if !more {
				break
			}
			after = &page[0].ID
		}
		if walked != len(all) {
			t.Fatalf("walked %d accounts, listed %d", walked, len(all))
		}
		if _, _, err := repo.ListIdentitySyncAccounts(ctx, issuer, nil, 101); err == nil {
			t.Fatal("accepted a page over 100")
		}
	})

	t.Run("revoke ends every session of the linked account at once", func(t *testing.T) {
		app := fiber.New()
		app.Get("/me", middleware.NewJWTMiddleware("test-secret"), users.ActiveUser(repo), func(c fiber.Ctx) error {
			return c.SendStatus(200)
		})
		call := func(session users.IssuedSession) int {
			t.Helper()
			token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{"sub": session.UserID, "sid": session.ID,
				"exp": time.Now().Add(time.Minute).Unix()}).SignedString([]byte("test-secret"))
			if err != nil {
				t.Fatal(err)
			}
			req := httptest.NewRequest("GET", "/me", nil)
			req.Header.Set("Authorization", "Bearer "+token)
			res, err := app.Test(req)
			if err != nil {
				t.Fatal(err)
			}
			res.Body.Close()
			return res.StatusCode
		}
		first, err := repo.CreateSession(ctx, linked, "a", "")
		if err != nil {
			t.Fatal(err)
		}
		second, err := repo.CreateSession(ctx, linked, "b", "")
		if err != nil {
			t.Fatal(err)
		}
		other, err := repo.CreateSession(ctx, bystander, "c", "")
		if err != nil {
			t.Fatal(err)
		}
		// A refresh before the revoke: the rotated token must die with the session too.
		second, err = repo.RefreshSession(ctx, second.RefreshToken)
		if err != nil {
			t.Fatal(err)
		}
		if call(first) != 200 || call(second) != 200 {
			t.Fatal("sessions were not usable before the revoke")
		}

		ended, err := repo.RevokeOIDCSessions(ctx, issuer, "subject-linked")
		if err != nil || ended != 2 {
			t.Fatalf("revoke ended %d sessions: %v", ended, err)
		}
		for _, s := range []users.IssuedSession{first, second} {
			if status := call(s); status != 401 {
				t.Fatalf("access token after revoke returned %d", status)
			}
			if active, err := repo.SessionActive(ctx, s.UserID, s.ID); err != nil || active {
				t.Fatalf("session still active: %v %v", active, err)
			}
			if _, err := repo.RefreshSession(ctx, s.RefreshToken); !errors.Is(err, users.ErrRefreshInvalid) {
				t.Fatalf("refresh after revoke: %v", err)
			}
		}
		if call(other) != 200 {
			t.Fatal("revoke ended another account's session")
		}
		// Idempotent, and unlinked identities are not an error.
		if n, err := repo.RevokeOIDCSessions(ctx, issuer, "subject-linked"); err != nil || n != 0 {
			t.Fatalf("second revoke: %d %v", n, err)
		}
		if n, err := repo.RevokeOIDCSessions(ctx, issuer, "never-linked"); err != nil || n != 0 {
			t.Fatalf("unlinked revoke: %d %v", n, err)
		}
		// Another issuer's subject never matches this issuer's link.
		if n, err := repo.RevokeOIDCSessions(ctx, otherIssuer, "subject-bystander"); err != nil || n != 0 {
			t.Fatalf("cross-issuer revoke: %d %v", n, err)
		}
		// The link and the account's roles survive.
		user, err := repo.FindByOIDCIdentity(ctx, issuer, "subject-linked")
		if err != nil || user.ID != linked || len(user.Roles) == 0 {
			t.Fatalf("link or roles changed: %v %v", user, err)
		}
	})
}
