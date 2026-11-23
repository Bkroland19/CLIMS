package notifications

import (
	"context"

	"github.com/jackc/pgx/v5"
)

// One target's filters; each is skipped when its parameter is NULL.
const targetQuery = `SELECT u.id FROM users u
	WHERE u.status = 'active'
		AND ($1::text[] IS NULL OR u.id = ANY($1::text[]::uuid[]))
		AND ($2::text IS NULL OR EXISTS (
			SELECT 1 FROM role_user ru JOIN roles r ON r.id = ru.role_id
			WHERE ru.user_id = u.id AND r.name = $2))
		AND ($3::text IS NULL OR EXISTS (
			SELECT 1 FROM role_user ru JOIN role_permission rp ON rp.role_id = ru.role_id
			JOIN permissions p ON p.id = rp.permission_id
			WHERE ru.user_id = u.id AND p.name = $3))
		AND ($4::uuid IS NULL OR u.store_id = $4)
		AND ($5::uuid IS NULL OR u.store_id IN (SELECT s.id FROM stores s WHERE s.district_id = $5))
		AND ($6::uuid IS NULL OR u.id <> $6)
	ORDER BY u.id`

func nullable(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}

// resolveTargets returns the active users matching any target, without
// duplicates and without the excluded user.
func resolveTargets(ctx context.Context, tx pgx.Tx, targets []Target, excluded *string) ([]string, error) {
	seen := map[string]bool{}
	var recipients []string
	for _, t := range targets {
		var userIDs []string
		if len(t.UserIDs) > 0 {
			userIDs = t.UserIDs
		}
		rows, err := tx.Query(ctx, targetQuery, userIDs, nullable(t.Role), nullable(t.Permission),
			nullable(t.StoreID), nullable(t.DistrictID), excluded)
		if err != nil {
			return nil, err
		}
		ids, err := pgx.CollectRows(rows, pgx.RowTo[string])
		if err != nil {
			return nil, err
		}
		for _, id := range ids {
			if !seen[id] {
				seen[id] = true
				recipients = append(recipients, id)
			}
		}
	}
	return recipients, nil
}
