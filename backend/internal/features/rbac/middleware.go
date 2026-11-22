package rbac

import (
	"clims-backend/internal/features/audit"
	"clims-backend/internal/pkg/response"

	"github.com/gofiber/fiber/v3"
)

const PrincipalKey = "current_user"

// PermissionHolder lets RBAC authorize an identity without depending on users or auth.
type PermissionHolder interface{ HasPermission(string) bool }

func RequirePermission(code string) fiber.Handler {
	return func(c fiber.Ctx) error {
		principal, ok := c.Locals(PrincipalKey).(PermissionHolder)
		if !ok {
			return response.Error(c, 401, "unauthorized", nil)
		}
		if !principal.HasPermission(code) {
			// The audit middleware records this denial after the request.
			c.Locals(audit.DeniedPermissionKey, code)
			return response.Error(c, 403, "permission denied", nil)
		}
		return c.Next()
	}
}
