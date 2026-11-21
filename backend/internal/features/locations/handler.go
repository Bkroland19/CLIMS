package locations

import (
	"log/slog"

	"clims-backend/internal/pkg/request"
	"clims-backend/internal/pkg/response"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Handler struct {
	db *pgxpool.Pool
}

func NewHandler(db *pgxpool.Pool) *Handler {
	return &Handler{db: db}
}

func (h *Handler) Regions(c fiber.Ctx) error {
	regions, err := h.regions(c.Context())
	if err != nil {
		return lookupError(c, err)
	}
	return response.Success(c, 200, "regions retrieved", regions)
}

func (h *Handler) Districts(c fiber.Ctx) error {
	var regionID *string
	if raw := c.Query("region_id"); raw != "" {
		id, err := request.ParseUUID(raw)
		if err != nil {
			return response.Error(c, 400, "region_id must be a nonzero UUID", nil)
		}
		regionID = &id
	}
	districts, err := h.districts(c.Context(), regionID)
	if err != nil {
		return lookupError(c, err)
	}
	return response.Success(c, 200, "districts retrieved", districts)
}

func (h *Handler) Subcounties(c fiber.Ctx) error {
	districtID, err := request.ParseUUID(c.Query("district_id"))
	if err != nil {
		return response.Error(c, 400, "district_id is required and must be a nonzero UUID", nil)
	}
	subcounties, err := h.subcounties(c.Context(), districtID)
	if err != nil {
		return lookupError(c, err)
	}
	return response.Success(c, 200, "subcounties retrieved", subcounties)
}

func lookupError(c fiber.Ctx, err error) error {
	slog.Error("location lookup failed", "error", err)
	return response.Error(c, 500, "location lookup failed", nil)
}
