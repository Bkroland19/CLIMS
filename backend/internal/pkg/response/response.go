package response

import (
	"github.com/gofiber/fiber/v3"
)

type APIResponse struct {
	Success bool        `json:"success"`
	Message string      `json:"message,omitempty"`
	Data    interface{} `json:"data,omitempty"`
	Error   interface{} `json:"error,omitempty"`
}

// Success sends a standardized success response
func Success(c fiber.Ctx, status int, message string, data interface{}) error {
	return c.Status(status).JSON(APIResponse{
		Success: true,
		Message: message,
		Data:    data,
	})
}

// List sends a 200 success response whose data is always a JSON array. A nil
// slice would otherwise be omitted or encoded as null, which clients that
// expect a list reject.
func List[T any](c fiber.Ctx, message string, items []T) error {
	if items == nil {
		items = []T{}
	}
	return Success(c, 200, message, items)
}

// Error sends a standardized error response
func Error(c fiber.Ctx, status int, message string, errDetails interface{}) error {
	return c.Status(status).JSON(APIResponse{
		Success: false,
		Message: message,
		Error:   errDetails,
	})
}
