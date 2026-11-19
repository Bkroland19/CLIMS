package orders

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
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

type createRequest struct {
	CondomID           string  `json:"condom_id"`
	QuantityNeeded     int32   `json:"quantity_needed"`
	Date               *string `json:"order_date"`
	OrderedForStoreID  string  `json:"ordered_for_store_id"`
	OrderedFromStoreID string  `json:"ordered_from_store_id"`
	UnitOfMeasureID    string  `json:"unit_of_measure_id"`
	Comment            *string `json:"comment"`
}

type Handler struct {
	repo *Repository
}

func RegisterRoutes(router fiber.Router, repo *Repository, jwt, activeUser fiber.Handler) {
	h := &Handler{repo: repo}
	group := router.Group("/orders", jwt, activeUser)
	group.Get("/", rbac.RequirePermission("orders:read"), h.list)
	group.Post("/", rbac.RequirePermission("orders:create"), h.create)
	group.Get("/:id", rbac.RequirePermission("orders:read"), h.get)
	group.Patch("/:id/fulfill", rbac.RequirePermission("orders:fulfill"), h.fulfill)
}

func scopeFor(user *users.User) scope {
	return scope{storeID: user.StoreID, allStores: user.HasPermission("orders:all_stores")}
}

func (h *Handler) list(c fiber.Ctx) error {
	limit, limitErr := strconv.ParseInt(c.Query("limit", "50"), 10, 32)
	offset, offsetErr := strconv.ParseInt(c.Query("offset", "0"), 10, 32)
	if limitErr != nil || offsetErr != nil || limit < 1 || limit > 100 || offset < 0 {
		return response.Error(c, 400, "limit must be between 1 and 100 and offset must be nonnegative", nil)
	}
	orders, err := h.repo.list(c.Context(), scopeFor(users.CurrentUser(c)), int32(limit), int32(offset))
	if err != nil {
		return orderError(c, err)
	}
	return response.Success(c, 200, "", orders)
}

func (h *Handler) get(c fiber.Ctx) error {
	id, err := request.UUIDParam(c)
	if err != nil {
		return response.Error(c, 400, err.Error(), nil)
	}
	order, err := h.repo.get(c.Context(), scopeFor(users.CurrentUser(c)), id)
	if err != nil {
		return orderError(c, err)
	}
	return response.Success(c, 200, "", order)
}

func (h *Handler) create(c fiber.Ctx) error {
	var input createRequest
	if err := request.DecodeJSON(c, &input); err != nil {
		return response.Error(c, 400, "invalid request body", nil)
	}
	ids := []struct {
		name  string
		value *string
	}{
		{"condom_id", &input.CondomID},
		{"ordered_for_store_id", &input.OrderedForStoreID},
		{"ordered_from_store_id", &input.OrderedFromStoreID},
		{"unit_of_measure_id", &input.UnitOfMeasureID},
	}
	for _, field := range ids {
		id, err := request.ParseUUID(*field.value)
		if err != nil {
			return response.Error(c, 422, field.name+" must be a nonzero UUID", nil)
		}
		*field.value = id
	}
	if input.OrderedForStoreID == input.OrderedFromStoreID || input.QuantityNeeded <= 0 {
		return response.Error(c, 422, "orders require distinct stores and a positive quantity_needed", nil)
	}
	if input.Date != nil {
		if parsed, err := time.Parse(time.DateOnly, *input.Date); err != nil || parsed.Year() < 1 {
			return response.Error(c, 422, "order_date must be a valid YYYY-MM-DD date", nil)
		}
	}

	user := users.CurrentUser(c)
	access := scopeFor(user)
	if !access.allStores && (access.storeID == nil || *access.storeID != input.OrderedForStoreID) {
		return response.Error(c, 403, "orders must be requested for your assigned store", nil)
	}
	order, err := h.repo.create(c.Context(), user.ID, input)
	if err != nil {
		return orderError(c, err)
	}
	return response.Success(c, 201, "order created", order)
}

func (h *Handler) fulfill(c fiber.Ctx) error {
	id, err := request.UUIDParam(c)
	if err != nil {
		return response.Error(c, 400, err.Error(), nil)
	}
	var input struct {
		Quantity int32 `json:"quantity_issued"`
	}
	if err := request.DecodeJSON(c, &input); err != nil {
		return response.Error(c, 400, "invalid request body", nil)
	}
	if input.Quantity <= 0 {
		return response.Error(c, 422, "quantity_issued must be positive", nil)
	}

	user := users.CurrentUser(c)
	access := scopeFor(user)
	order, err := h.repo.fulfill(c.Context(), access, id, user.ID, input.Quantity)
	if errors.Is(err, pgx.ErrNoRows) {
		existing, lookupErr := h.repo.get(c.Context(), access, id)
		if lookupErr != nil {
			return orderError(c, lookupErr)
		}
		if !access.allStores && (access.storeID == nil || *access.storeID != existing.OrderedFromStoreID) {
			return response.Error(c, 403, "only the supplying store can fulfill this order", nil)
		}
		return response.Error(c, 409, "order has already been fulfilled", nil)
	}
	if err != nil {
		return orderError(c, err)
	}
	return response.Success(c, 200, "order fulfilled", order)
}

func orderError(c fiber.Ctx, err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return response.Error(c, 404, "order not found", nil)
	}
	var dbError *pgconn.PgError
	if errors.As(err, &dbError) {
		switch dbError.Code {
		case "23503":
			return response.Error(c, 422, "a referenced user, store, product or unit does not exist", nil)
		case "23514":
			return response.Error(c, 422, "quantity_issued cannot exceed quantity_needed", nil)
		}
	}
	slog.Error("orders operation failed", "error", err)
	return response.Error(c, 500, "orders operation failed", nil)
}
