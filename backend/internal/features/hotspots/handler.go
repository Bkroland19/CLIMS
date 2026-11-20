package hotspots

import (
	"errors"
	"log/slog"
	"slices"
	"strconv"
	"strings"
	"unicode/utf8"

	"clims-backend/internal/features/rbac"
	"clims-backend/internal/features/users"
	"clims-backend/internal/pkg/request"
	"clims-backend/internal/pkg/response"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// Submission holds the hotspot details a VHT submits; text limits match the legacy columns.
type Submission struct {
	Name                   string   `json:"name"`
	DistrictID             string   `json:"district_id"`
	Type                   *string  `json:"type"`
	Village                *string  `json:"village"`
	ContactPersonName      *string  `json:"contact_person_name"`
	ContactPersonTelephone *string  `json:"contact_person_telephone"`
	HasCondomDispenser     *bool    `json:"has_condom_dispenser"`
	DispenserCondition     *string  `json:"dispenser_condition"`
	Latitude               *float64 `json:"latitude"`
	Longitude              *float64 `json:"longitude"`
	Comment                *string  `json:"comment"`
}

// dispenserConditions are the conditions recorded for legacy dispensers.
var dispenserConditions = []string{"Good", "Poor", "Broken"}

type Handler struct {
	repo *Repository
}

func RegisterRoutes(router fiber.Router, repo *Repository, jwt, activeUser fiber.Handler) {
	h := &Handler{repo: repo}
	group := router.Group("/hotspots", jwt, activeUser)
	group.Get("/", rbac.RequirePermission("hotspots:read"), h.list)
	group.Post("/", rbac.RequirePermission("hotspots:submit"), h.submit)
	group.Get("/notifications", rbac.RequirePermission("hotspots:read"), h.notifications)
	group.Get("/districts", rbac.RequirePermission("hotspots:submit"), h.districts)
	group.Post("/:id/actions/:action", rbac.RequirePermission("hotspots:activate"), h.act)
}

func scopeFor(user *users.User) scope {
	return scope{userID: user.ID, storeID: user.StoreID, allDistricts: user.HasPermission("hotspots:all_districts")}
}

func (h *Handler) list(c fiber.Ctx) error {
	limit, limitErr := strconv.ParseInt(c.Query("limit", "50"), 10, 32)
	offset, offsetErr := strconv.ParseInt(c.Query("offset", "0"), 10, 32)
	if limitErr != nil || offsetErr != nil || limit < 1 || limit > 100 || offset < 0 {
		return response.Error(c, 400, "limit must be between 1 and 100 and offset must be nonnegative", nil)
	}
	result, err := h.repo.list(c.Context(), scopeFor(users.CurrentUser(c)), c.Query("status"), int32(limit), int32(offset))
	if err != nil {
		return hotSpotError(c, err)
	}
	return response.Success(c, 200, "", result)
}

func (h *Handler) submit(c fiber.Ctx) error {
	var input Submission
	if err := request.DecodeJSON(c, &input); err != nil {
		return response.Error(c, 400, "invalid request body", nil)
	}
	if message := validate(&input); message != "" {
		return response.Error(c, 422, message, nil)
	}
	result, err := h.repo.submit(c.Context(), users.CurrentUser(c).ID, input)
	if err != nil {
		return hotSpotError(c, err)
	}
	return response.Success(c, 201, "hotspot submitted for district verification", result)
}

func (h *Handler) act(c fiber.Ctx) error {
	id, err := request.UUIDParam(c)
	if err != nil {
		return response.Error(c, 400, err.Error(), nil)
	}
	action := c.Params("action")
	if _, exists := transitions[action]; !exists {
		return response.Error(c, 404, "unknown hotspot action", nil)
	}
	var input struct {
		Reason *string `json:"reason"`
	}
	if len(c.Body()) != 0 {
		if err = request.DecodeJSON(c, &input); err != nil {
			return response.Error(c, 400, "invalid request body", nil)
		}
	}
	if input.Reason != nil {
		trimmed := strings.TrimSpace(*input.Reason)
		input.Reason = &trimmed
	}
	if (action == "reject") != (input.Reason != nil && *input.Reason != "") ||
		input.Reason != nil && utf8.RuneCountInString(*input.Reason) > 1000 {
		return response.Error(c, 422, "reject requires a reason of at most 1000 characters; other actions take no body", nil)
	}
	result, err := h.repo.act(c.Context(), scopeFor(users.CurrentUser(c)), id, action, input.Reason)
	if err != nil {
		return hotSpotError(c, err)
	}
	return response.Success(c, 200, "", result)
}

func (h *Handler) notifications(c fiber.Ctx) error {
	offset, err := strconv.ParseInt(c.Query("offset", "0"), 10, 32)
	if err != nil || offset < 0 {
		return response.Error(c, 400, "offset must be nonnegative", nil)
	}
	events, err := h.repo.notifications(c.Context(), scopeFor(users.CurrentUser(c)), int32(offset))
	if err != nil {
		return hotSpotError(c, err)
	}
	return response.Success(c, 200, "", events)
}

func (h *Handler) districts(c fiber.Ctx) error {
	result, err := h.repo.districts(c.Context())
	if err != nil {
		return hotSpotError(c, err)
	}
	return response.Success(c, 200, "", result)
}

// validate normalizes the submission in place and returns a client message when it is invalid.
func validate(in *Submission) string {
	in.Name = strings.TrimSpace(in.Name)
	if in.Name == "" || utf8.RuneCountInString(in.Name) > 40 {
		return "name is required and must be at most 40 characters"
	}
	district, err := request.ParseUUID(in.DistrictID)
	if err != nil {
		return "district_id must be a nonzero UUID"
	}
	in.DistrictID = district
	for _, field := range []struct {
		name  string
		value **string
		max   int
	}{
		{"type", &in.Type, 40},
		{"village", &in.Village, 20},
		{"contact_person_name", &in.ContactPersonName, 40},
		{"contact_person_telephone", &in.ContactPersonTelephone, 15},
		{"comment", &in.Comment, 100},
		{"dispenser_condition", &in.DispenserCondition, 60},
	} {
		if *field.value == nil {
			continue
		}
		trimmed := strings.TrimSpace(**field.value)
		if utf8.RuneCountInString(trimmed) > field.max {
			return field.name + " must be at most " + strconv.Itoa(field.max) + " characters"
		}
		*field.value = &trimmed
		if trimmed == "" {
			*field.value = nil
		}
	}
	hasDispenser := in.HasCondomDispenser != nil && *in.HasCondomDispenser
	if hasDispenser != (in.DispenserCondition != nil) ||
		in.DispenserCondition != nil && !slices.Contains(dispenserConditions, *in.DispenserCondition) {
		return "dispenser_condition is required with a condom dispenser and must be Good, Poor or Broken"
	}
	if (in.Latitude == nil) != (in.Longitude == nil) ||
		in.Latitude != nil && (*in.Latitude < -90 || *in.Latitude > 90 || *in.Longitude < -180 || *in.Longitude > 180) {
		return "latitude and longitude must be given together, within -90..90 and -180..180"
	}
	return ""
}

func hotSpotError(c fiber.Ctx, err error) error {
	var dbError *pgconn.PgError
	switch {
	case errors.Is(err, pgx.ErrNoRows):
		return response.Error(c, 404, "hotspot not found", nil)
	case errors.Is(err, errForbidden):
		return response.Error(c, 403, err.Error(), nil)
	case errors.Is(err, errConflict):
		return response.Error(c, 409, err.Error(), nil)
	case errors.As(err, &dbError) && dbError.Code == "23503":
		return response.Error(c, 422, "district_id does not reference a district", nil)
	}
	slog.Error("hotspots operation failed", "error", err)
	return response.Error(c, 500, "hotspots operation failed", nil)
}
