package inventory

import (
	"errors"
	"log/slog"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"clims-backend/internal/features/rbac"
	"clims-backend/internal/features/stock"
	"clims-backend/internal/features/users"
	"clims-backend/internal/pkg/request"
	"clims-backend/internal/pkg/response"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5/pgconn"
)

var errForbidden = errors.New("this store is outside your assignment")

type Handler struct {
	repo *Repository
}

func RegisterRoutes(router fiber.Router, repo *Repository, jwt, activeUser fiber.Handler) {
	h := &Handler{repo: repo}
	group := router.Group("/inventory", jwt, activeUser)
	group.Get("/stock", rbac.RequirePermission("inventory:read"), h.stock)
	group.Get("/batches", rbac.RequirePermission("inventory:read"), h.batches)
	group.Get("/hotspots", rbac.RequirePermission("inventory:read"), h.hotspots)
	group.Get("/movements", rbac.RequirePermission("inventory:read"), h.movements)
	group.Post("/movements", rbac.RequirePermission("inventory:manage"), h.record)
	group.Get("/summary", rbac.RequirePermission("inventory:read"), h.summary)
}

// Store assignment follows the orders module: orders:all_stores reaches every store and hotspot.
func scopeFor(user *users.User) scope {
	return scope{storeID: user.StoreID, hotSpotID: user.HotSpotID, allStores: user.HasPermission("orders:all_stores")}
}

func (h *Handler) stock(c fiber.Ctx) error {
	storeID, condomID, err := optionalIDs(c, "store_id", "condom_id")
	if err != nil {
		return response.Error(c, 400, err.Error(), nil)
	}
	storeType := c.Query("store_type")
	if storeType != "" && storeType != "national" && storeType != "district" {
		return response.Error(c, 400, "store_type must be national or district", nil)
	}
	result, err := h.repo.stock(c.Context(), scopeFor(users.CurrentUser(c)),
		StockFilter{StoreID: storeID, StoreType: storeType, CondomID: condomID})
	return reply(c, result, err)
}

func (h *Handler) batches(c fiber.Ctx) error {
	storeID, condomID, err := optionalIDs(c, "store_id", "condom_id")
	if err != nil {
		return response.Error(c, 400, err.Error(), nil)
	}
	result, err := h.repo.batches(c.Context(), scopeFor(users.CurrentUser(c)),
		StockFilter{StoreID: storeID, CondomID: condomID}, time.Now())
	return reply(c, result, err)
}

func (h *Handler) hotspots(c fiber.Ctx) error {
	hotSpotID, condomID, err := optionalIDs(c, "hot_spot_id", "condom_id")
	if err != nil {
		return response.Error(c, 400, err.Error(), nil)
	}
	p, err := parsePeriod(c)
	if err != nil {
		return response.Error(c, 400, err.Error(), nil)
	}
	result, err := h.repo.hotspots(c.Context(), scopeFor(users.CurrentUser(c)),
		HotspotFilter{HotSpotID: hotSpotID, CondomID: condomID, Period: p})
	return reply(c, result, err)
}

var movementReasons = map[string]bool{"opening": true, "receipt": true, "adjustment": true, "dispatch": true, "order_receipt": true}

func (h *Handler) movements(c fiber.Ctx) error {
	storeID, condomID, err := optionalIDs(c, "store_id", "condom_id")
	if err != nil {
		return response.Error(c, 400, err.Error(), nil)
	}
	reason := c.Query("reason")
	if reason != "" && !movementReasons[reason] {
		return response.Error(c, 400, "unknown reason", nil)
	}
	p, err := parsePeriod(c)
	if err != nil {
		return response.Error(c, 400, err.Error(), nil)
	}
	limit, limitErr := strconv.ParseInt(c.Query("limit", "50"), 10, 32)
	offset, offsetErr := strconv.ParseInt(c.Query("offset", "0"), 10, 32)
	if limitErr != nil || offsetErr != nil || limit < 1 || limit > 100 || offset < 0 {
		return response.Error(c, 400, "limit must be between 1 and 100 and offset must be nonnegative", nil)
	}
	result, err := h.repo.movements(c.Context(), scopeFor(users.CurrentUser(c)), MovementFilter{
		StoreID: storeID, CondomID: condomID, Reason: reason, Period: p, Limit: int32(limit), Offset: int32(offset)})
	return reply(c, result, err)
}

func (h *Handler) record(c fiber.Ctx) error {
	var in MovementInput
	if err := request.DecodeJSON(c, &in); err != nil {
		return response.Error(c, 400, "invalid request body", nil)
	}
	if message := validate(&in); message != "" {
		return response.Error(c, 422, message, nil)
	}
	user := users.CurrentUser(c)
	access := scopeFor(user)
	if !access.allStores && (access.storeID == nil || *access.storeID != in.StoreID) {
		return inventoryError(c, errForbidden)
	}
	result, err := h.repo.record(c.Context(), user.ID, in)
	if err != nil {
		return inventoryError(c, err)
	}
	return response.Success(c, 201, "stock recorded", result)
}

func (h *Handler) summary(c fiber.Ctx) error {
	if !scopeFor(users.CurrentUser(c)).allStores {
		return response.Error(c, 403, "the national summary requires orders:all_stores", nil)
	}
	_, condomID, err := optionalIDs(c, "", "condom_id")
	if err != nil {
		return response.Error(c, 400, err.Error(), nil)
	}
	p, err := parsePeriod(c)
	if err != nil {
		return response.Error(c, 400, err.Error(), nil)
	}
	result, err := h.repo.summary(c.Context(), condomID, p)
	return reply(c, result, err)
}

// validate normalizes a movement and returns a client message when it is invalid. Receipts add stock;
// adjustments correct it either way after a count and must say why.
func validate(in *MovementInput) string {
	for _, field := range []*string{&in.StoreID, &in.CondomID, &in.UnitOfMeasureID} {
		id, err := request.ParseUUID(*field)
		if err != nil {
			return "store_id, condom_id and unit_of_measure_id must be nonzero UUIDs"
		}
		*field = id
	}
	if in.Note != nil {
		note := strings.TrimSpace(*in.Note)
		in.Note = &note
		if note == "" {
			in.Note = nil
		} else if utf8.RuneCountInString(note) > 1000 {
			return "note must be at most 1000 characters"
		}
	}
	switch in.Reason {
	case "receipt":
		if in.Quantity <= 0 {
			return "a receipt needs a positive quantity"
		}
	case "adjustment":
		if in.Quantity == 0 || in.Note == nil {
			return "an adjustment needs a nonzero quantity and a note explaining it"
		}
	default:
		return "reason must be receipt or adjustment"
	}
	if in.Quantity > 1_000_000_000 || in.Quantity < -1_000_000_000 {
		return "quantity is out of range"
	}
	if in.BatchNumber != nil {
		number := strings.TrimSpace(*in.BatchNumber)
		in.BatchNumber = &number
		if number == "" {
			in.BatchNumber = nil
		} else if utf8.RuneCountInString(number) > 60 {
			return "batch_number must be at most 60 characters"
		}
	}
	if in.ExpiryDate != nil {
		expiry, err := time.Parse(time.DateOnly, *in.ExpiryDate)
		if err != nil {
			return "expiry_date must be a YYYY-MM-DD date"
		}
		in.expiry = &expiry
	}
	return ""
}

// optionalIDs reads two optional UUID query parameters; an empty name is skipped.
func optionalIDs(c fiber.Ctx, first, second string) (*string, *string, error) {
	var ids [2]*string
	for i, name := range []string{first, second} {
		if name == "" || c.Query(name) == "" {
			continue
		}
		id, err := request.ParseUUID(c.Query(name))
		if err != nil {
			return nil, nil, errors.New(name + " must be a nonzero UUID")
		}
		ids[i] = &id
	}
	return ids[0], ids[1], nil
}

// parsePeriod reads from and to as YYYY-MM-DD; both days are included.
func parsePeriod(c fiber.Ctx) (period, error) {
	var p period
	for _, bound := range []struct {
		name string
		dst  **time.Time
		end  bool
	}{{"from", &p.from, false}, {"to", &p.to, true}} {
		raw := c.Query(bound.name)
		if raw == "" {
			continue
		}
		day, err := time.Parse(time.DateOnly, raw)
		if err != nil {
			return period{}, errors.New(bound.name + " must be a YYYY-MM-DD date")
		}
		if bound.end {
			day = day.AddDate(0, 0, 1)
		}
		*bound.dst = &day
	}
	if p.from != nil && p.to != nil && !p.from.Before(*p.to) {
		return period{}, errors.New("from must not be after to")
	}
	return p, nil
}

func reply[T any](c fiber.Ctx, result []T, err error) error {
	if err != nil {
		return inventoryError(c, err)
	}
	return response.Success(c, 200, "", result)
}

func inventoryError(c fiber.Ctx, err error) error {
	var dbError *pgconn.PgError
	switch {
	case errors.Is(err, errForbidden):
		return response.Error(c, 403, err.Error(), nil)
	case errors.Is(err, errBelowReserved), errors.Is(err, stock.ErrBatchShort):
		return response.Error(c, 409, err.Error(), nil)
	case errors.As(err, &dbError) && dbError.Code == "23503":
		return response.Error(c, 422, "store_id, condom_id or unit_of_measure_id does not exist", nil)
	}
	slog.Error("inventory operation failed", "error", err)
	return response.Error(c, 500, "inventory operation failed", nil)
}
