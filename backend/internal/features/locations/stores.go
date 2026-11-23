package locations

import (
	"context"

	"clims-backend/internal/features/users"
	"clims-backend/internal/pkg/response"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5"
)

// StoreStock keeps quantities in their recorded units; boxes and pieces are never added together.
type StoreStock struct {
	Category *string `json:"category"`
	UnitID   string  `json:"unit_id"`
	Unit     string  `json:"unit"`
	Quantity int64   `json:"quantity"`
}

type StoreOverview struct {
	ID        string       `json:"id"`
	Name      string       `json:"name"`
	Kind      string       `json:"kind"`
	Region    *string      `json:"region"`
	District  *string      `json:"district"`
	Code      string       `json:"code"`
	UserCount int64        `json:"user_count"`
	OnHand    []StoreStock `json:"on_hand"`
}

// StoreOverview serves the administration list, scoped like the inventory endpoints.
func (h *Handler) StoreOverview(c fiber.Ctx) error {
	user := users.CurrentUser(c)
	stores, err := h.storeOverview(c.Context(), user.HasPermission("orders:all_stores"), user.StoreID)
	if err != nil {
		return lookupError(c, err)
	}
	return response.List(c, "stores retrieved", stores)
}

func (h *Handler) storeOverview(ctx context.Context, allStores bool, storeID *string) ([]StoreOverview, error) {
	rows, err := h.db.Query(ctx, `SELECT s.id, s.name, s.store_type, r.name, d.name, s.code,
		(SELECT count(*) FROM users u WHERE u.store_id = s.id),
		COALESCE((SELECT jsonb_agg(jsonb_build_object(
			'category', stock.category, 'unit_id', stock.unit_id, 'unit', stock.unit, 'quantity', stock.quantity)
			ORDER BY stock.category NULLS LAST, stock.unit, stock.unit_id)
			FROM (SELECT c.category, um.id AS unit_id, um.name AS unit, sum(b.on_hand)::bigint AS quantity
				FROM order_store_stock b JOIN condoms c ON c.id = b.condom_id
				JOIN unit_of_measures um ON um.id = b.unit_of_measure_id
				WHERE b.store_id = s.id
				GROUP BY c.category, um.id, um.name HAVING sum(b.on_hand) > 0) stock), '[]'::jsonb)
		FROM stores s LEFT JOIN districts d ON d.id = s.district_id
		LEFT JOIN regions r ON r.id = d.region_id
		WHERE ($1::boolean OR s.id = $2::uuid)
		ORDER BY s.store_type <> 'national', s.name, s.id`, allStores, storeID)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowToStructByPos[StoreOverview])
}
