package notifications

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Repository reads and updates a user's own inbox.
type Repository struct {
	db *pgxpool.Pool
}

func NewRepository(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}

func (r *Repository) list(ctx context.Context, userID string, unreadOnly bool, limit, offset int32) ([]Notification, error) {
	rows, err := r.db.Query(ctx, `SELECT n.id, n.type, n.title, n.body, n.resource_type, n.resource_id,
			n.actor_id, n.data, nr.read_at, n.created_at
		FROM notification_recipients nr JOIN notifications n ON n.id = nr.notification_id
		WHERE nr.user_id = $1 AND (NOT $2 OR nr.read_at IS NULL)
		ORDER BY nr.created_at DESC, nr.notification_id DESC LIMIT $3 OFFSET $4`,
		userID, unreadOnly, limit, offset)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowToStructByPos[Notification])
}

func (r *Repository) unreadCount(ctx context.Context, userID string) (int64, error) {
	var count int64
	err := r.db.QueryRow(ctx, `SELECT count(*) FROM notification_recipients
		WHERE user_id = $1 AND read_at IS NULL`, userID).Scan(&count)
	return count, err
}

// markRead marks one of the user's notifications read. It returns pgx.ErrNoRows
// when the notification is not addressed to the user; marking it again changes nothing.
func (r *Repository) markRead(ctx context.Context, userID, id string) error {
	var found bool
	err := r.db.QueryRow(ctx, `WITH target AS (
			SELECT notification_id FROM notification_recipients WHERE user_id = $1 AND notification_id = $2
		), updated AS (
			UPDATE notification_recipients SET read_at = CURRENT_TIMESTAMP
			WHERE user_id = $1 AND notification_id = $2 AND read_at IS NULL
		)
		SELECT EXISTS (SELECT 1 FROM target)`, userID, id).Scan(&found)
	if err == nil && !found {
		return pgx.ErrNoRows
	}
	return err
}

func (r *Repository) markAllRead(ctx context.Context, userID string) (int64, error) {
	tag, err := r.db.Exec(ctx, `UPDATE notification_recipients SET read_at = CURRENT_TIMESTAMP
		WHERE user_id = $1 AND read_at IS NULL`, userID)
	return tag.RowsAffected(), err
}
