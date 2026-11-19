package users

import (
	"context"
	"errors"

	"clims-backend/internal/features/rbac"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrUnknownRole = errors.New("unknown role")

var ErrLastAdmin = errors.New("cannot disable or demote the last active admin")

type Repository struct{ DB *pgxpool.Pool }

func NewRepository(db *pgxpool.Pool) *Repository { return &Repository{DB: db} }
func (r *Repository) CreateUser(ctx context.Context, req AccountInput, passwordHash string, roleID string) (string, error) {
	var roleIDs []string
	if roleID != "" {
		roleIDs = []string{roleID}
	}
	return r.CreateUserWithRoles(ctx, req, passwordHash, roleIDs)
}

func (r *Repository) CreateUserWithRoles(ctx context.Context, req AccountInput, passwordHash string, roleIDs []string) (string, error) {
	tx, err := r.DB.Begin(ctx)
	if err != nil {
		return "", err
	}
	defer tx.Rollback(ctx)
	var id string
	err = tx.QueryRow(ctx, `INSERT INTO users
		(username,email,password,firstname,lastname,phone_number,location,organisation_unit_id,hot_spot_id,status,created_at,updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING id`,
		req.Username, req.Email, passwordHash, req.FirstName, req.LastName, req.Phone,
		req.Location, req.Assignment.OrganisationUnitID, req.Assignment.HotSpotID).Scan(&id)
	if err != nil {
		return "", err
	}
	if len(roleIDs) > 0 {
		if err = replaceRoles(ctx, tx, id, roleIDs); err != nil {
			return "", err
		}
	}
	return id, tx.Commit(ctx)
}

const userSelect = `SELECT u.id,u.username,COALESCE(u.email,''),u.password,u.firstname,u.lastname,u.phone_number,u.status,
	u.location,u.organisation_unit_id,u.hot_spot_id,u.subcounty_id,u.store_id,u.created_at,u.updated_at,
	COALESCE((
		SELECT jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name, 'permissions', ARRAY(
			SELECT p.name FROM role_permission rp JOIN permissions p ON p.id = rp.permission_id
			WHERE rp.role_id = r.id ORDER BY p.name
		)) ORDER BY r.id)
		FROM role_user ru JOIN roles r ON r.id = ru.role_id WHERE ru.user_id = u.id
	), '[]'::jsonb) FROM users u `

func scanUser(row pgx.Row) (*User, error) {
	var u User
	err := row.Scan(&u.ID, &u.Username, &u.Email, &u.PasswordHash, &u.FirstName, &u.LastName, &u.Phone, &u.Status,
		&u.Location, &u.OrganisationUnitID, &u.HotSpotID, &u.SubcountyID, &u.StoreID,
		&u.CreatedAt, &u.UpdatedAt, &u.Roles)
	if err != nil {
		return nil, err
	}
	u.Firstname, u.Lastname = u.FirstName, u.LastName
	if len(u.Roles) > 0 {
		u.Role = &u.Roles[0]
	}
	return &u, nil
}

func (r *Repository) GetUserByEmail(ctx context.Context, email string) (*User, error) {
	return scanUser(r.DB.QueryRow(ctx, userSelect+`WHERE lower(btrim(u.email))=lower(btrim($1))`, email))
}

func (r *Repository) GetUserByID(ctx context.Context, id string) (*User, error) {
	return scanUser(r.DB.QueryRow(ctx, userSelect+`WHERE u.id=$1`, id))
}

func (r *Repository) ListUsers(ctx context.Context, limit, offset int) ([]User, error) {
	rows, err := r.DB.Query(ctx, userSelect+`ORDER BY u.id LIMIT $1 OFFSET $2`, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	users := []User{}
	for rows.Next() {
		u, err := scanUser(rows)
		if err != nil {
			return nil, err
		}
		users = append(users, *u)
	}
	return users, rows.Err()
}

func (r *Repository) UpdateUserAccess(ctx context.Context, id string, roleID *string, status *string) error {
	var roleIDs []string
	if roleID != nil {
		roleIDs = []string{*roleID}
	}
	return r.updateUserAccess(ctx, id, roleIDs, status)
}

func (r *Repository) SetUserRoles(ctx context.Context, id string, roleIDs []string) error {
	return r.updateUserAccess(ctx, id, roleIDs, nil)
}

// Serialize account changes so concurrent requests cannot remove every active admin.
func (r *Repository) updateUserAccess(ctx context.Context, id string, roleIDs []string, status *string) error {
	tx, err := r.DB.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, `SELECT pg_advisory_xact_lock(68421301)`); err != nil {
		return err
	}
	var currentStatus string
	var currentAdmin bool
	if err = tx.QueryRow(ctx, `SELECT u.status, EXISTS (
		SELECT 1 FROM role_user ru JOIN roles r ON r.id = ru.role_id
		WHERE ru.user_id = u.id AND r.name = $2
	) FROM users u WHERE u.id=$1 FOR UPDATE`, id, rbac.AdminRoleName).Scan(&currentStatus, &currentAdmin); err != nil {
		return err
	}
	newStatus := currentStatus
	if status != nil {
		newStatus = *status
	}
	if roleIDs != nil {
		if err = replaceRoles(ctx, tx, id, roleIDs); err != nil {
			return err
		}
	}
	if _, err = tx.Exec(ctx, `UPDATE users SET status=$2,updated_at=CURRENT_TIMESTAMP WHERE id=$1`, id, newStatus); err != nil {
		return err
	}
	if currentAdmin && currentStatus == "active" && (newStatus != "active" || roleIDs != nil) {
		var adminRemaining bool
		if err = tx.QueryRow(ctx, `SELECT EXISTS (
			SELECT 1 FROM role_user ru JOIN users u ON u.id = ru.user_id
			JOIN roles r ON r.id = ru.role_id WHERE r.name = $1 AND u.status = 'active'
		)`, rbac.AdminRoleName).Scan(&adminRemaining); err != nil {
			return err
		}
		if !adminRemaining {
			return ErrLastAdmin
		}
	}
	return tx.Commit(ctx)
}

func replaceRoles(ctx context.Context, tx pgx.Tx, userID string, roleIDs []string) error {
	var unknown bool
	if err := tx.QueryRow(ctx, `SELECT EXISTS (
		SELECT 1 FROM unnest($1::text[]::uuid[]) AS requested(id)
		WHERE NOT EXISTS (SELECT 1 FROM roles r WHERE r.id = requested.id)
	)`, roleIDs).Scan(&unknown); err != nil {
		return err
	}
	if unknown {
		return ErrUnknownRole
	}
	if _, err := tx.Exec(ctx, `DELETE FROM role_user ru
		WHERE ru.user_id = $1 AND NOT (ru.role_id = ANY($2::text[]::uuid[]))`,
		userID, roleIDs); err != nil {
		return err
	}
	_, err := tx.Exec(ctx, `INSERT INTO role_user (user_id, role_id)
		SELECT u.id, r.id FROM users u CROSS JOIN roles r
		WHERE u.id = $1 AND r.id = ANY($2::text[]::uuid[]) ON CONFLICT DO NOTHING`,
		userID, roleIDs)
	return err
}
