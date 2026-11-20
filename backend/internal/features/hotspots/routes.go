package hotspots

import (
	"clims-backend/internal/features/rbac"

	"github.com/gofiber/fiber/v3"
)

func RegisterRoutes(router fiber.Router, repo *Repository, jwtMiddleware, activeUser fiber.Handler) {
	h := &Handler{repo: repo}
	read := rbac.RequirePermission("hotspots:read")
	submit := rbac.RequirePermission("hotspots:submit")
	activate := rbac.RequirePermission("hotspots:activate")

	group := router.Group("/hotspots", jwtMiddleware, activeUser)
	group.Get("/", read, h.list)
	group.Post("/", submit, h.submit)
	group.Get("/notifications", read, h.notifications)
	group.Get("/districts", submit, h.districts)
	group.Get("/:id", read, h.get)
	group.Put("/:id", submit, h.update)
	group.Get("/:id/events", read, h.events)
	group.Post("/:id/comments", read, h.comment)
	group.Post("/:id/activate", activate, h.decision("activate", "hotspot activated"))
	group.Post("/:id/deactivate", activate, h.decision("deactivate", "hotspot deactivated"))
	group.Post("/:id/reject", activate, h.decision("reject", "hotspot rejected"))
}
