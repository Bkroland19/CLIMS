package locations

import "github.com/gofiber/fiber/v3"

func RegisterRoutes(router fiber.Router, handler *Handler, jwtMiddleware, activeUser fiber.Handler) {
	group := router.Group("/locations", jwtMiddleware, activeUser)
	group.Get("/regions", handler.Regions)
	group.Get("/districts", handler.Districts)
	group.Get("/subcounties", handler.Subcounties)
	group.Get("/stores", handler.Stores)
}
