package synclog

import (
	"log/slog"
	"strconv"
	"time"

	"clims-backend/internal/features/rbac"
	"clims-backend/internal/features/users"
	"clims-backend/internal/pkg/request"
	"clims-backend/internal/pkg/response"

	"github.com/gofiber/fiber/v3"
)

type Handler struct {
	repo *Repository
	now  func() time.Time
}

// RegisterRoutes serves POST /sync-log to every signed-in user, who reports only their own phone's
// entries, and GET /sync-log to holders of sync_logs:read.
func RegisterRoutes(router fiber.Router, repo *Repository, jwtMiddleware, activeUser fiber.Handler) {
	h := &Handler{repo: repo, now: time.Now}
	group := router.Group("/sync-log", jwtMiddleware, activeUser)
	group.Post("/", h.upload)
	group.Get("/", rbac.RequirePermission("sync_logs:read"), h.search)
}

func (h *Handler) upload(c fiber.Ctx) error {
	var body Upload
	if err := request.DecodeJSON(c, &body); err != nil {
		return response.Error(c, 400, "invalid request body", nil)
	}
	if errs := body.validate(h.now()); len(errs) > 0 {
		return response.Error(c, 422, "validation failed", errs)
	}
	err := h.repo.save(c.Context(), users.CurrentUser(c).ID, users.CurrentSessionID(c), body)
	if err != nil {
		slog.Error("sync log upload failed", "error", err)
		return response.Error(c, 500, "sync log upload failed", nil)
	}
	return response.Success(c, 200, "sync log saved", fiber.Map{"saved": len(body.Entries)})
}

func (h *Handler) search(c fiber.Ctx) error {
	limit, limitErr := strconv.ParseInt(c.Query("limit", "50"), 10, 32)
	offset, offsetErr := strconv.ParseInt(c.Query("offset", "0"), 10, 32)
	if limitErr != nil || offsetErr != nil || limit < 1 || limit > 100 || offset < 0 {
		return response.Error(c, 400, "limit must be between 1 and 100 and offset must be nonnegative", nil)
	}
	f := Filter{Status: c.Query("status"), Action: c.Query("action"), ClientEntryID: c.Query("client_entry_id")}
	if f.Status != "" && !statuses[f.Status] {
		return response.Error(c, 400, "status must be waiting, retrying, sent, refused or saved_on_phone", nil)
	}
	if f.Action != "" && !actions[f.Action] {
		return response.Error(c, 400, "action is not a field app action", nil)
	}
	if f.ClientEntryID != "" && !clientEntryPattern.MatchString(f.ClientEntryID) {
		return response.Error(c, 400, "client_entry_id must be 8 to 64 letters, digits, - or _", nil)
	}
	if raw := c.Query("user_id"); raw != "" {
		id, err := request.ParseUUID(raw)
		if err != nil {
			return response.Error(c, 400, "user_id must be a nonzero UUID", nil)
		}
		f.UserID = &id
	}
	for name, target := range map[string]**time.Time{"from": &f.From, "to": &f.To} {
		if raw := c.Query(name); raw != "" {
			at, err := parseTime(raw)
			if err != nil {
				return response.Error(c, 400, name+" must be a date (2026-11-21) or an RFC 3339 time", nil)
			}
			*target = &at
		}
	}
	if f.From != nil && f.To != nil && !f.From.Before(*f.To) {
		return response.Error(c, 400, "from must be before to", nil)
	}
	records, err := h.repo.search(c.Context(), f, int32(limit), int32(offset))
	if err != nil {
		slog.Error("sync log search failed", "error", err)
		return response.Error(c, 500, "sync log search failed", nil)
	}
	return response.Success(c, 200, "sync log entries retrieved", records)
}

// parseTime accepts a date, meaning its start in UTC, or an RFC 3339 time.
func parseTime(raw string) (time.Time, error) {
	if at, err := time.Parse(time.DateOnly, raw); err == nil {
		return at, nil
	}
	return time.Parse(time.RFC3339, raw)
}
