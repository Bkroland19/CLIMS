package audit

import (
	"context"
	"log/slog"
	"regexp"

	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/requestid"
)

// DeniedPermissionKey is the request local the permission check sets to the
// permission it refused, so Middleware can record the denial.
const DeniedPermissionKey = "audit.denied_permission"

// ClientEntryHeader names the field app's sync log entry behind a request. Entries
// the request writes keep it as details.client_entry_id, so the phone's report in
// mobile_sync_log can be matched to what the server recorded.
const ClientEntryHeader = "X-Client-Entry-Id"

// clientEntryPattern matches mobile_sync_log.client_entry_id; anything else is ignored.
var clientEntryPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{8,64}$`)

type contextKey struct{}

// requestInfo is what an entry needs to know about the request that caused it.
type requestInfo struct {
	ip, userAgent, requestID string
	// clientEntryID is the field app's sync log entry, from ClientEntryHeader.
	clientEntryID string
	// system names an automated job acting without a person.
	system string
	// The signed-in user and session are read when an entry is written: the
	// authentication middleware that sets them runs after Middleware.
	actorID   func() string
	sessionID func() string
}

func none() string { return "" }

func requestFrom(ctx context.Context) requestInfo {
	if r, ok := ctx.Value(contextKey{}).(*requestInfo); ok {
		return *r
	}
	return requestInfo{actorID: none, sessionID: none}
}

// Middleware attaches the request's address, device, request ID, signed-in user
// and session to its context, so features only describe what happened. After the
// request, it records a refused permission on a data-changing request as
// access.denied. Register it after the client IP and request ID middleware.
func Middleware(auditor Auditor) fiber.Handler {
	return func(c fiber.Ctx) error {
		local := func(key string) func() string {
			return func() string {
				value, _ := c.Locals(key).(string)
				return value
			}
		}
		clientEntry := c.Get(ClientEntryHeader)
		if !clientEntryPattern.MatchString(clientEntry) {
			clientEntry = ""
		}
		c.SetContext(context.WithValue(c.Context(), contextKey{}, &requestInfo{
			ip:            c.IP(),
			userAgent:     c.Get(fiber.HeaderUserAgent),
			requestID:     requestid.FromContext(c),
			clientEntryID: clientEntry,
			// Set by the JWT middleware for authenticated requests.
			actorID:   local("user_id"),
			sessionID: local("session_id"),
		}))
		err := c.Next()
		recordDenial(c, auditor)
		return err
	}
}

// recordDenial audits a permission the check refused. Reads are left out: a denied
// read changes nothing, and listing screens would flood the log.
func recordDenial(c fiber.Ctx, auditor Auditor) {
	permission, denied := c.Locals(DeniedPermissionKey).(string)
	if !denied {
		return
	}
	switch c.Method() {
	case fiber.MethodGet, fiber.MethodHead, fiber.MethodOptions:
		return
	}
	err := auditor.RecordNow(c.Context(), Entry{Action: "access.denied", Outcome: OutcomeFailure,
		Reason: "missing_permission", Details: map[string]any{
			"permission": permission, "method": c.Method(), "path": c.Path(), "route": c.Route().Path,
		}})
	if err != nil {
		// The response is already decided; a lost denial must not change it.
		slog.Error("record permission denial", "error", err, "permission", permission)
	}
}

// WithSystemActor marks work done by an automated job or command, such as
// cmd/create-admin, so its entries name the job instead of a person.
func WithSystemActor(ctx context.Context, name string) context.Context {
	return context.WithValue(ctx, contextKey{}, &requestInfo{system: name, actorID: none, sessionID: none})
}

// AsSystemActor marks a request made by a service rather than a person, such as the
// identity sync client, keeping the request's address, device and request ID.
func AsSystemActor(ctx context.Context, name string) context.Context {
	info := requestFrom(ctx)
	info.system, info.actorID, info.sessionID = name, none, none
	return context.WithValue(ctx, contextKey{}, &info)
}

// Anonymous reports whether no person or job is behind ctx, e.g. public sign-up.
func Anonymous(ctx context.Context) bool {
	r := requestFrom(ctx)
	return r.actorID() == "" && r.system == ""
}
