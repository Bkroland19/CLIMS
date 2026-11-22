package orders

import (
	"context"

	"clims-backend/internal/features/users"
	"clims-backend/internal/pkg/request"
	"clims-backend/internal/pkg/response"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5"
)

// riderAt matches the account u when it can take deliveries from the store bound to the SQL
// placeholder store: active, assigned to that store and holding orders:deliver. Dispatch accepts
// exactly the riders the picker lists.
func riderAt(store string) string {
	return `u.status = 'active' AND u.store_id = ` + store + `::uuid AND EXISTS (
		SELECT FROM role_user ru JOIN role_permission rp ON rp.role_id = ru.role_id
		JOIN permissions p ON p.id = rp.permission_id
		WHERE ru.user_id = u.id AND p.name = 'orders:deliver')`
}

type Rider struct {
	ID        string `json:"id"`
	FirstName string `json:"first_name"`
	LastName  string `json:"last_name"`
	Phone     string `json:"phone_number"`
	// OpenDeliveries counts the rider's dispatched hotspot orders not yet delivered.
	OpenDeliveries int32 `json:"open_deliveries"`
}

func (r *Repository) riders(ctx context.Context, storeID string) ([]Rider, error) {
	rows, err := r.db.Query(ctx, `SELECT u.id, u.firstname, u.lastname, u.phone_number,
			(SELECT count(*) FROM orders o WHERE o.rider_id = u.id AND o.hot_spot_id IS NOT NULL
				AND o.order_status = 'dispatched')::int
		FROM users u WHERE `+riderAt("$1")+`
		ORDER BY u.firstname, u.lastname, u.id`, storeID)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowToStructByPos[Rider])
}

// listRiders lists the riders a DCFP can dispatch from their store. orders:all_stores names the store.
func (h *Handler) listRiders(c fiber.Ctx) error {
	access := scopeFor(users.CurrentUser(c))
	storeID := c.Query("store_id")
	if storeID != "" {
		id, err := request.ParseUUID(storeID)
		if err != nil {
			return response.Error(c, 400, "store_id must be a nonzero UUID", nil)
		}
		storeID = id
	}
	switch {
	case access.allStores && storeID == "":
		return response.Error(c, 400, "store_id is required with orders:all_stores", nil)
	case access.allStores:
	case access.storeID == nil:
		return response.Error(c, 403, "riders are listed for your assigned store; you have none", nil)
	case storeID != "" && storeID != *access.storeID:
		return response.Error(c, 403, "riders are listed for your assigned store only", nil)
	default:
		storeID = *access.storeID
	}
	riders, err := h.repo.riders(c.Context(), storeID)
	if err != nil {
		return orderError(c, err)
	}
	return response.List(c, "riders retrieved", riders)
}
