package reports

import (
	"errors"
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

func RegisterRoutes(router fiber.Router, repo *Repository, jwt, activeUser fiber.Handler) {
	h := &Handler{repo: repo, now: time.Now}
	group := router.Group("/reports", jwt, activeUser, rbac.RequirePermission("reports:read"))
	group.Get("/notifications", h.notificationSummary)
	group.Get("/notifications/records", h.notificationRecords)
}

func (h *Handler) notificationSummary(c fiber.Ctx) error {
	f, s, err := h.filter(c)
	if err != nil {
		return response.Error(c, 400, err.Error(), nil)
	}
	summary, err := h.repo.notificationSummary(c.Context(), s, f, h.now())
	if err != nil {
		slog.Error("notification report failed", "error", err)
		return response.Error(c, 500, "the report could not be calculated", nil)
	}
	return response.Success(c, 200, "", summary)
}

func (h *Handler) notificationRecords(c fiber.Ctx) error {
	f, s, err := h.filter(c)
	if err != nil {
		return response.Error(c, 400, err.Error(), nil)
	}
	f.Status = c.Query("status")
	switch f.Status {
	case "", "fulfilled", "partly_received", "awaiting_acknowledgement", "awaiting_supply":
	default:
		return response.Error(c, 400, "status must be fulfilled, partly_received, awaiting_acknowledgement or awaiting_supply", nil)
	}
	limit, limitErr := strconv.ParseInt(c.Query("limit", "50"), 10, 32)
	offset, offsetErr := strconv.ParseInt(c.Query("offset", "0"), 10, 32)
	if limitErr != nil || offsetErr != nil || limit < 1 || limit > 100 || offset < 0 {
		return response.Error(c, 400, "limit must be between 1 and 100 and offset must be nonnegative", nil)
	}
	f.Limit, f.Offset = int32(limit), int32(offset)
	records, err := h.repo.notificationRecords(c.Context(), s, f)
	if err != nil {
		slog.Error("notification records failed", "error", err)
		return response.Error(c, 500, "the records could not be loaded", nil)
	}
	return response.Success(c, 200, "", records)
}

// filter reads the period, geography, product and response settings shared by every notification
// report, and the user's scope.
// shortcut: deadline_days and target_percent are request parameters; RF07 wants them saved per
// organisation with who set them and when. Upgrade once the programme approves the defaults.
func (h *Handler) filter(c fiber.Ctx) (Filter, scope, error) {
	f, err := ParseFilter(c.Query("from"), c.Query("to"), c.Query("category"), c.Query("deadline_days", "7"),
		c.Query("target_percent", "80"), h.now())
	if err != nil {
		return Filter{}, scope{}, err
	}
	for name, dst := range map[string]**string{"district_id": &f.DistrictID, "hot_spot_id": &f.HotSpotID} {
		if raw := c.Query(name); raw != "" {
			id, err := request.ParseUUID(raw)
			if err != nil {
				return Filter{}, scope{}, errors.New(name + " must be a UUID")
			}
			*dst = &id
		}
	}
	s, err := h.repo.scopeFor(c.Context(), users.CurrentUser(c))
	return f, s, err
}

// ParseFilter reads a report period as Kampala calendar days, both included, defaulting to the
// current month to date, with the product filter and the deadline settings.
func ParseFilter(from, to, category, deadlineDays, target string, now time.Time) (Filter, error) {
	today := now.In(Kampala)
	day := func(raw string, fallback time.Time) (time.Time, error) {
		if raw == "" {
			return fallback, nil
		}
		parsed, err := time.ParseInLocation(time.DateOnly, raw, Kampala)
		if err != nil {
			return time.Time{}, errors.New("from and to must be YYYY-MM-DD dates")
		}
		return parsed, nil
	}
	var f Filter
	start, err := day(from, time.Date(today.Year(), today.Month(), 1, 0, 0, 0, 0, Kampala))
	if err != nil {
		return Filter{}, err
	}
	end, err := day(to, time.Date(today.Year(), today.Month(), today.Day(), 0, 0, 0, 0, Kampala))
	if err != nil {
		return Filter{}, err
	}
	if end.Before(start) {
		return Filter{}, errors.New("from must not be after to")
	}
	f.From, f.To = start, end.AddDate(0, 0, 1)
	switch category {
	case "", "male", "female":
		f.Category = category
	default:
		return Filter{}, errors.New("category must be male or female")
	}
	if f.DeadlineDays, err = strconv.Atoi(deadlineDays); err != nil || f.DeadlineDays < 1 || f.DeadlineDays > 365 {
		return Filter{}, errors.New("deadline_days must be between 1 and 365")
	}
	if f.Target, err = strconv.Atoi(target); err != nil || f.Target < 1 || f.Target > 100 {
		return Filter{}, errors.New("target_percent must be between 1 and 100")
	}
	return f, nil
}
