package users

import (
	"context"
	"errors"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

var (
	ErrIdentityAccountIneligible = errors.New("CLIMS account is missing or ineligible")
	ErrIdentityLinkConflict      = errors.New("CLIMS identity link conflicts with an existing link")
)

// IdentitySyncAccount is an eligible account and, when it has one, the subject linked for the
// requested issuer.
type IdentitySyncAccount struct {
	ID          uuid.UUID
	Email       string
	LinkSubject *string
}

// MaxIdentitySyncPage is the largest page the identity-sync contract allows.
const MaxIdentitySyncPage = 100

const identitySyncEligible = `u.status = 'active' AND EXISTS (
	SELECT 1 FROM role_user ru JOIN roles r ON r.id = ru.role_id WHERE ru.user_id = u.id
)`

// ListIdentitySyncAccounts returns up to limit eligible users in UUID order, each with its link for
// issuer, and whether more follow. Pass the last returned ID to resume, or nil to start.
func (r *Repository) ListIdentitySyncAccounts(ctx context.Context, issuer string, after *uuid.UUID, limit int) ([]IdentitySyncAccount, bool, error) {
	if limit < 1 || limit > MaxIdentitySyncPage {
		return nil, false, errors.New("invalid identity sync page size")
	}
	// One extra row tells whether another page exists, so the last page ends the listing itself.
	rows, err := r.DB.Query(ctx, `
		SELECT u.id, COALESCE(u.email, ''), identity.subject FROM users u
		LEFT JOIN user_oidc_identities identity ON identity.user_id = u.id AND identity.issuer = $2
		WHERE ($1::uuid IS NULL OR u.id > $1) AND `+identitySyncEligible+`
		ORDER BY u.id LIMIT $3`, after, issuer, limit+1)
	if err != nil {
		return nil, false, err
	}
	accounts, err := pgx.CollectRows(rows, pgx.RowToStructByPos[IdentitySyncAccount])
	if err != nil {
		return nil, false, err
	}
	if len(accounts) > limit {
		return accounts[:limit], true, nil
	}
	return accounts, false, nil
}

// LinkOIDCIdentity accepts a verified identity from the trusted reconciler.
// An exact retry succeeds. Either uniqueness conflict preserves the existing link.
func (r *Repository) LinkOIDCIdentity(ctx context.Context, id uuid.UUID, issuer, subject string) error {
	if id == uuid.Nil || strings.TrimSpace(issuer) == "" || strings.TrimSpace(subject) == "" {
		return errors.New("invalid CLIMS identity link")
	}
	return pgx.BeginTxFunc(ctx, r.DB, pgx.TxOptions{IsoLevel: pgx.ReadCommitted}, func(tx pgx.Tx) error {
		var userID uuid.UUID
		err := tx.QueryRow(ctx, `SELECT u.id FROM users u WHERE u.id = $1 AND `+identitySyncEligible+`
			FOR UPDATE OF u`, id).Scan(&userID)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrIdentityAccountIneligible
		}
		if err != nil {
			return err
		}
		if _, err = tx.Exec(ctx, `
			INSERT INTO user_oidc_identities (issuer, subject, user_id)
			VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, issuer, subject, userID); err != nil {
			return err
		}
		var linked bool
		if err = tx.QueryRow(ctx, `SELECT EXISTS (
			SELECT 1 FROM user_oidc_identities WHERE issuer = $1 AND subject = $2 AND user_id = $3
		)`, issuer, subject, userID).Scan(&linked); err != nil {
			return err
		}
		if !linked {
			return ErrIdentityLinkConflict
		}
		return nil
	})
}

// RevokeOIDCSessions ends every session of the account linked to issuer and subject, which also
// invalidates their refresh tokens. The link and the account's roles stay. It reports how many
// sessions ended; an unlinked identity ends none and is not an error.
func (r *Repository) RevokeOIDCSessions(ctx context.Context, issuer, subject string) (int64, error) {
	tag, err := r.DB.Exec(ctx, `UPDATE user_sessions s SET revoked_at = CURRENT_TIMESTAMP
		FROM user_oidc_identities identity
		WHERE identity.issuer = $1 AND identity.subject = $2 AND s.user_id = identity.user_id
			AND s.revoked_at IS NULL`, issuer, subject)
	return tag.RowsAffected(), err
}
