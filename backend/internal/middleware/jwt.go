package middleware

import (
	"clims-backend/internal/pkg/request"
	"log"

	jwtware "github.com/gofiber/contrib/v3/jwt"
	"github.com/gofiber/fiber/v3"
	"github.com/golang-jwt/jwt/v5"
)

func NewJWTMiddleware(secret string) fiber.Handler {
	return jwtware.New(jwtware.Config{
		ParserOptions: []jwt.ParserOption{jwt.WithExpirationRequired()},
		SigningKey:    jwtware.SigningKey{JWTAlg: jwtware.HS256, Key: []byte(secret)},
		SuccessHandler: func(c fiber.Ctx) error {
			token := jwtware.FromContext(c)
			if token == nil {
				return c.SendStatus(fiber.StatusUnauthorized)
			}
			claims, ok := token.Claims.(jwt.MapClaims)
			if !ok {
				return c.SendStatus(fiber.StatusUnauthorized)
			}
			subject, err := claims.GetSubject()
			if err != nil {
				return c.SendStatus(fiber.StatusUnauthorized)
			}
			userID, err := request.ParseUUID(subject)
			if err != nil {
				return c.SendStatus(fiber.StatusUnauthorized)
			}
			// Tokens name their login session; users.ActiveUser checks it is still live.
			rawSession, _ := claims["sid"].(string)
			sessionID, err := request.ParseUUID(rawSession)
			if err != nil {
				return c.SendStatus(fiber.StatusUnauthorized)
			}
			c.Locals("user_id", userID)
			c.Locals("session_id", sessionID)
			return c.Next()
		},
		ErrorHandler: func(c fiber.Ctx, err error) error {
			log.Printf("JWT authentication failed: %v", err)
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "Unauthorized: missing or invalid token",
			})
		},
	})
}
