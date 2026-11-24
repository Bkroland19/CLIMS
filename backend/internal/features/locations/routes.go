package locations

import (
	"clims-backend/internal/features/rbac"

	"github.com/gofiber/fiber/v3"
)

func RegisterRoutes(router fiber.Router, handler *Handler, jwtMiddleware, activeUser fiber.Handler) {
	group := router.Group("/locations", jwtMiddleware, activeUser)
	group.Get("/regions", handler.Regions)
	group.Get("/districts", handler.Districts)
	group.Get("/subcounties", handler.Subcounties)
	// Hotspot counts for every place in the country are national knowledge, unlike the place names.
	group.Get("/geography", rbac.RequirePermission("hotspots:all_districts"), handler.Geography)
	group.Get("/stores", handler.Stores)
	router.Get("/stores", jwtMiddleware, activeUser, rbac.RequirePermission("inventory:read"), handler.StoreOverview)
}
