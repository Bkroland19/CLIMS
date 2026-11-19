package auth

import "clims-backend/internal/features/users"

type RegisterRequest struct{ users.AccountInput }

type LoginRequest struct {
	// Login is an email address, username or phone number.
	Login string `json:"login" validate:"omitempty,max=255"`
	// Email is the older name for Login, still accepted from existing clients.
	Email    string `json:"email" validate:"omitempty,max=255"`
	Password string `json:"password" validate:"required,max=72"`
}
