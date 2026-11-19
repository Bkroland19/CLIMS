package rbac

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrUnknownPermission = errors.New("unknown permission")

var ErrAdminRole = errors.New("admin permissions cannot be changed")

type Repository struct{ DB *pgxpool.Pool }

func NewRepository(db *pgxpool.Pool) *Repository { return &Repository{DB: db} }
func (r *Repository) ListRoles(ctx context.Context) ([]Role, error) {
	rows, err := r.DB.Query(ctx, `SELECT r.id, r.name, ARRAY(
SELECT p.name FROM role_permission rp JOIN permissions p ON p.id = rp.permission_id
WHERE rp.role_id = r.id ORDER BY p.name) FROM roles r ORDER BY r.name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	roles := []Role{}
	for rows.Next() {
		var role Role
		if err := rows.Scan(&role.ID, &role.Name, &role.Permissions); err != nil {
			return nil, err
		}
		roles = append(roles, role)
	}
	return roles, rows.Err()
}

func (r *Repository) ListPermissions(ctx context.Context) ([]string, error) {
	rows, err := r.DB.Query(ctx, `SELECT name FROM permissions ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	codes := []string{}
	for rows.Next() {
		var code string
		if err = rows.Scan(&code); err != nil {
			return nil, err
		}
		codes = append(codes, code)
	}
	return codes, rows.Err()
}

func (r *Repository) SetRolePermissions(ctx context.Context, id string, codes []string) error {
	tx, err := r.DB.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	var name string
	if err = tx.QueryRow(ctx, `SELECT name FROM roles WHERE id=$1 FOR UPDATE`, id).Scan(&name); err != nil {
		return err
	}
	if name == AdminRoleName {
		return ErrAdminRole
	}
	var unknown bool
	if err = tx.QueryRow(ctx, `SELECT EXISTS (
		SELECT 1 FROM unnest($1::text[]) AS requested(name)
		WHERE NOT EXISTS (SELECT 1 FROM permissions p WHERE p.name = requested.name)
	)`, codes).Scan(&unknown); err != nil {
		return err
	}
	if unknown {
		return ErrUnknownPermission
	}
	if _, err = tx.Exec(ctx, `DELETE FROM role_permission WHERE role_id=$1 AND permission_id NOT IN (SELECT id FROM permissions WHERE name = ANY($2::text[]))`, id, codes); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, `INSERT INTO role_permission (role_id, permission_id)
		SELECT $1, id FROM permissions WHERE name = ANY($2) ON CONFLICT DO NOTHING`, id, codes); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
