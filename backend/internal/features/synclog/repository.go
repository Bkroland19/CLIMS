package synclog

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository struct {
	db *pgxpool.Pool
}

func NewRepository(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}

// An entry is re-sent whenever it changes. Uploads can arrive out of order after a retry, so an
// older version (by the phone's changed_at) never replaces a newer one.
const upsertEntry = `INSERT INTO mobile_sync_log (user_id, session_id, client_entry_id, action, status,
		server_record_id, queued_at, changed_at, attempt_count, attempts, last_error,
		platform, os_version, app_version)
	VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
	ON CONFLICT (user_id, client_entry_id) DO UPDATE SET
		session_id = EXCLUDED.session_id, action = EXCLUDED.action, status = EXCLUDED.status,
		server_record_id = EXCLUDED.server_record_id, queued_at = EXCLUDED.queued_at,
		changed_at = EXCLUDED.changed_at, attempt_count = EXCLUDED.attempt_count,
		attempts = EXCLUDED.attempts, last_error = EXCLUDED.last_error, platform = EXCLUDED.platform,
		os_version = EXCLUDED.os_version, app_version = EXCLUDED.app_version,
		received_at = CURRENT_TIMESTAMP
	WHERE mobile_sync_log.changed_at <= EXCLUDED.changed_at`

// save stores an upload in one transaction, so a phone that retries after a lost response
// never leaves half of a batch behind.
func (r *Repository) save(ctx context.Context, userID, sessionID string, u Upload) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck // a no-op after Commit
	for _, e := range u.Entries {
		attempts, err := e.attemptsJSON()
		if err != nil {
			return fmt.Errorf("encode attempts: %w", err)
		}
		if _, err = tx.Exec(ctx, upsertEntry, userID, nullable(sessionID), e.ClientEntryID, e.Action, e.Status,
			e.ServerRecordID, e.QueuedAt, e.ChangedAt, e.AttemptCount, attempts, e.lastError(),
			u.Device.Platform, nullable(u.Device.OSVersion), nullable(u.Device.AppVersion)); err != nil {
			return fmt.Errorf("save sync log entry: %w", err)
		}
	}
	return tx.Commit(ctx)
}

// Filter narrows a search; empty fields match everything.
type Filter struct {
	UserID        *string
	Status        string
	Action        string
	ClientEntryID string
	// From and To bound when the phone saved the action.
	From, To *time.Time
}

// search returns matching entries, most recently saved first.
func (r *Repository) search(ctx context.Context, f Filter, limit, offset int32) ([]Record, error) {
	rows, err := r.db.Query(ctx, `SELECT l.id, l.client_entry_id, u.id, u.username,
			ARRAY(SELECT ro.name FROM role_user ru JOIN roles ro ON ro.id = ru.role_id
				WHERE ru.user_id = u.id ORDER BY ro.name),
			l.action, l.status, l.server_record_id, l.queued_at, l.changed_at, l.attempt_count, l.attempts,
			l.last_error, l.platform, coalesce(l.os_version, ''), coalesce(l.app_version, ''), l.received_at
		FROM mobile_sync_log l JOIN users u ON u.id = l.user_id
		WHERE ($1::uuid IS NULL OR l.user_id = $1) AND ($2 = '' OR l.status = $2) AND ($3 = '' OR l.action = $3)
			AND ($4 = '' OR l.client_entry_id = $4)
			AND ($5::timestamptz IS NULL OR l.queued_at >= $5) AND ($6::timestamptz IS NULL OR l.queued_at < $6)
		ORDER BY l.queued_at DESC, l.id DESC LIMIT $7 OFFSET $8`,
		f.UserID, f.Status, f.Action, f.ClientEntryID, f.From, f.To, limit, offset)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (Record, error) {
		var rec Record
		err := row.Scan(&rec.ID, &rec.ClientEntryID, &rec.User.ID, &rec.User.Username, &rec.User.Roles,
			&rec.Action, &rec.Status, &rec.ServerRecordID, &rec.QueuedAt, &rec.ChangedAt, &rec.AttemptCount,
			&rec.Attempts, &rec.LastError, &rec.Device.Platform, &rec.Device.OSVersion, &rec.Device.AppVersion,
			&rec.ReceivedAt)
		return rec, err
	})
}

func nullable(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}
