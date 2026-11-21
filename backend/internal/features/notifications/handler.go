package notifications

import (
	"errors"
	"log/slog"
	"strconv"

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

func inboxError(c fiber.Ctx, err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return response.Error(c, 404, "notification not found", nil)
	}
	slog.Error("notification inbox failed", "error", err)
	return response.Error(c, 500, "notification inbox failed", nil)
}
