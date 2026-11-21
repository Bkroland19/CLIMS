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

// Store is a stock-holding point: a national warehouse or a district's store.
type Store struct {
	ID           string  `json:"id"`
	Code         string  `json:"code"`
	Name         string  `json:"name"`
	StoreType    string  `json:"store_type"`
	DistrictID   *string `json:"district_id"`
	DistrictName *string `json:"district_name"`
}

// stores lists national warehouses first, then district stores by name. storeType and
// districtID narrow the list when set.
func (h *Handler) stores(ctx context.Context, storeType *string, districtID *string) ([]Store, error) {
	rows, err := h.db.Query(ctx, `SELECT s.id, s.code, s.name, s.store_type, s.district_id, d.name
		FROM stores s LEFT JOIN districts d ON d.id = s.district_id
		WHERE ($1::text IS NULL OR s.store_type = $1) AND ($2::uuid IS NULL OR s.district_id = $2)
		ORDER BY s.store_type <> 'national', s.name, s.id`, storeType, districtID)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowToStructByPos[Store])
}
