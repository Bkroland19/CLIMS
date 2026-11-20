package rbac

const AdminRoleName = "admin"

// RegisteredUserRoleID matches the role seeded by migration 000015.
const RegisteredUserRoleID = "dbe80723-b6ae-42ec-a614-596a092a06a2"

type Role struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Permissions []string `json:"permissions"`
}
