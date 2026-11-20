package hotspots

import (
	"clims-backend/internal/features/rbac"

	"github.com/gofiber/fiber/v3"
)

func RegisterRoutes(router fiber.Router, handler *Handler, jwtMiddleware, activeUser fiber.Handler) {
	read := rbac.RequirePermission("hotspots:read")
	submit := rbac.RequirePermission("hotspots:submit")
	verify := rbac.RequirePermission("hotspots:verify")

	group := router.Group("/hotspots", jwtMiddleware, activeUser)
	group.Get("/", read, handler.list)
	group.Post("/", submit, handler.submit)
	group.Get("/notifications", read, handler.notifications)
	group.Get("/:id", read, handler.get)
	group.Put("/:id", submit, handler.update)
	group.Get("/:id/events", read, handler.events)
	group.Post("/:id/comments", read, handler.comment)
	group.Post("/:id/activate", verify, handler.activate)
	group.Post("/:id/deactivate", verify, handler.deactivate)
}
