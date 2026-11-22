package catalogue

import (
	"clims-backend/internal/features/rbac"

	"github.com/gofiber/fiber/v3"
)

// RegisterRoutes mounts /catalogue. Any active user may read the catalogue, since
// order and stock forms pick from it; changing it needs catalogue:manage.
func RegisterRoutes(router fiber.Router, repo *Repository, jwtMiddleware, activeUser fiber.Handler) {
	h := &Handler{repo: repo}
	manage := rbac.RequirePermission("catalogue:manage")

	group := router.Group("/catalogue", jwtMiddleware, activeUser)
	group.Get("/products", h.listProducts)
	group.Post("/products", manage, h.createProduct)
	group.Patch("/products/:id", manage, h.updateProduct)
	group.Delete("/products/:id", manage, h.deleteProduct)
	for _, kind := range []lookupKind{types, brands, units} {
		group.Get("/"+kind.path, h.listLookups(kind))
		group.Post("/"+kind.path, manage, h.createLookup(kind))
		group.Patch("/"+kind.path+"/:id", manage, h.updateLookup(kind))
		group.Delete("/"+kind.path+"/:id", manage, h.deleteLookup(kind))
	}
}
