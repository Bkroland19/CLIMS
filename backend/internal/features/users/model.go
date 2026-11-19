package users

import "clims-backend/internal/features/rbac"

type User struct {
	ID           int         `json:"id"`
	Username     string      `json:"username"`
	Email        string      `json:"email"`
	Firstname    string      `json:"firstname"`
	Lastname     string      `json:"lastname"`
	Phone        string      `json:"phone_number"`
	Status       string      `json:"status"`
	Role         *rbac.Role  `json:"role"`
	Roles        []rbac.Role `json:"roles"`
	PasswordHash string      `json:"-"`
}

func (u *User) HasPermission(code string) bool {
	if u == nil {
		return false
	}
	for _, role := range u.Roles {
		for _, permission := range role.Permissions {
			if permission == code {
				return true
			}
		}
	}
	return false
}
