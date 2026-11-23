package notifications

import (
	"errors"
	"log/slog"
	"strconv"
	"strings"

	"clims-backend/internal/features/users"
	"clims-backend/internal/pkg/request"
	"clims-backend/internal/pkg/response"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5"
)

type Handler struct {
	repo *Repository
}

func (h *Handler) list(c fiber.Ctx) error {
	limit, limitErr := strconv.ParseInt(c.Query("limit", "50"), 10, 32)
	offset, offsetErr := strconv.ParseInt(c.Query("offset", "0"), 10, 32)
	if limitErr != nil || offsetErr != nil || limit < 1 || limit > 100 || offset < 0 {
		return response.Error(c, 400, "limit must be between 1 and 100 and offset must be nonnegative", nil)
	}
	unread, err := strconv.ParseBool(c.Query("unread", "false"))
	if err != nil {
		return response.Error(c, 400, "unread must be true or false", nil)
	}
	items, err := h.repo.list(c.Context(), users.CurrentUser(c).ID, unread, int32(limit), int32(offset))
	if err != nil {
		return inboxError(c, err)
	}
	return response.Success(c, 200, "notifications retrieved", items)
}

func (h *Handler) unreadCount(c fiber.Ctx) error {
	count, err := h.repo.unreadCount(c.Context(), users.CurrentUser(c).ID)
	if err != nil {
		return inboxError(c, err)
	}
	return response.Success(c, 200, "unread count retrieved", fiber.Map{"unread": count})
}

func (h *Handler) markRead(c fiber.Ctx) error {
	id, err := request.UUIDParam(c)
	if err != nil {
		return response.Error(c, 400, err.Error(), nil)
	}
	if err = h.repo.markRead(c.Context(), users.CurrentUser(c).ID, id); err != nil {
		return inboxError(c, err)
	}
	return response.Success(c, 200, "notification marked read", nil)
}

func (h *Handler) markAllRead(c fiber.Ctx) error {
	count, err := h.repo.markAllRead(c.Context(), users.CurrentUser(c).ID)
	if err != nil {
		return inboxError(c, err)
	}
	return response.Success(c, 200, "notifications marked read", fiber.Map{"marked": count})
}

type deviceRequest struct {
	Token    string `json:"token"`
	Platform string `json:"platform"`
}

// registerDevice records the phone's push token for the signed-in session, so the session's
// notifications also arrive as pushes. Signing out stops them.
func (h *Handler) registerDevice(c fiber.Ctx) error {
	var body deviceRequest
	if err := request.DecodeJSON(c, &body); err != nil {
		return response.Error(c, 400, "invalid request body", nil)
	}
	body.Token = strings.TrimSpace(body.Token)
	if body.Token == "" || len(body.Token) > 4096 {
		return response.Error(c, 422, "validation failed", fiber.Map{"token": "token is required"})
	}
	if body.Platform != "android" && body.Platform != "ios" {
		return response.Error(c, 422, "validation failed", fiber.Map{"platform": "platform must be android or ios"})
	}
	sessionID := users.CurrentSessionID(c)
	if sessionID == "" {
		return response.Error(c, 400, "push needs a signed-in session", nil)
	}
	if err := h.repo.registerDevice(c.Context(), users.CurrentUser(c).ID, sessionID, body.Token, body.Platform); err != nil {
		slog.Error("push device registration failed", "error", err)
		return response.Error(c, 500, "push device registration failed", nil)
	}
	return response.Success(c, 200, "push device registered", nil)
}

func inboxError(c fiber.Ctx, err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return response.Error(c, 404, "notification not found", nil)
	}
	slog.Error("notification inbox failed", "error", err)
	return response.Error(c, 500, "notification inbox failed", nil)
}
