package notifications

import "github.com/gofiber/fiber/v3"

// RegisterRoutes serves the signed-in user's own inbox; no extra permission is needed.
func RegisterRoutes(router fiber.Router, repo *Repository, jwtMiddleware, activeUser fiber.Handler) {
	h := &Handler{repo: repo}
	group := router.Group("/notifications", jwtMiddleware, activeUser)
	group.Get("/", h.list)
	group.Get("/unread-count", h.unreadCount)
	group.Post("/read-all", h.markAllRead)
	group.Post("/:id/read", h.markRead)
}
