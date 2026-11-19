package users

import (
	"time"

	"clims-backend/internal/features/rbac"
)

type User struct {
	FacilityAssignment
	ID          string     `json:"id"`
	Username    string     `json:"username"`
	Email       string     `json:"email"`
	FirstName   string     `json:"first_name"`
	LastName    string     `json:"last_name"`
	Firstname   string     `json:"firstname"`
	Lastname    string     `json:"lastname"`
	Phone       string     `json:"phone_number"`
	Location    *string    `json:"location"`
	SubcountyID *string    `json:"subcounty_id"`
	StoreID     *string    `json:"store_id"`
	CreatedAt   *time.Time `json:"created_at"`
	UpdatedAt   *time.Time `json:"updated_at"`
	Status      string     `json:"status"`
	LastLoginAt *time.Time `json:"last_login_at"`
	LoginCount  int        `json:"login_count"`
	// ActiveSessions counts the devices currently signed in.
	ActiveSessions int         `json:"active_sessions"`
	Role           *rbac.Role  `json:"role"`
	Roles          []rbac.Role `json:"roles"`
	PasswordHash   string      `json:"-"`
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
