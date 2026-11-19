package users

import "strings"

type AccountInput struct {
	Username  string `json:"username" validate:"required,min=3,max=50"`
	Email     string `json:"email" validate:"required,email,max=255"`
	Password  string `json:"password" validate:"required,min=8,max=72"`
	Firstname string `json:"firstname" validate:"max=20"`
	Lastname  string `json:"lastname" validate:"max=20"`
	Phone     string `json:"phone_number" validate:"max=15"`
}

type CreateUserRequest struct {
	AccountInput
	RoleID  string    `json:"role_id" validate:"omitempty,uuid_rfc4122"`
	RoleIDs *[]string `json:"role_ids" validate:"omitempty,min=1,max=100,dive,uuid_rfc4122"`
}

func (input *AccountInput) Normalize() {
	input.Username = strings.TrimSpace(input.Username)
	input.Email = strings.ToLower(strings.TrimSpace(input.Email))
}

type AssignRoleRequest struct {
	RoleID string `json:"role_id" validate:"required,uuid_rfc4122"`
}

type UpdateStatusRequest struct {
	Status string `json:"status" validate:"required,oneof=active disabled"`
}

type SetRolesRequest struct {
	RoleIDs *[]string `json:"role_ids" validate:"required,max=100,dive,uuid_rfc4122"`
}
