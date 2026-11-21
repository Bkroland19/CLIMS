package locations

import (
	"context"

	"github.com/jackc/pgx/v5"
)

type Place struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

func (h *Handler) regions(ctx context.Context) ([]Place, error) {
	rows, err := h.db.Query(ctx, `SELECT id, name FROM regions ORDER BY name, id`)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowToStructByPos[Place])
}

// districts lists every district, or only a region's when regionID is set.
func (h *Handler) districts(ctx context.Context, regionID *string) ([]Place, error) {
	rows, err := h.db.Query(ctx, `SELECT id, name FROM districts
		WHERE $1::uuid IS NULL OR region_id = $1 ORDER BY name, id`, regionID)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowToStructByPos[Place])
}

func (h *Handler) subcounties(ctx context.Context, districtID string) ([]Place, error) {
	rows, err := h.db.Query(ctx, `SELECT id, name FROM subcounties WHERE district_id = $1 ORDER BY name, id`, districtID)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowToStructByPos[Place])
}
