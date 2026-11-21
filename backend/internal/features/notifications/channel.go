package notifications

import (
	"context"

	"github.com/jackc/pgx/v5"
)

// Channel delivers a recorded notification to its recipients. In-app delivery
// writes inbox rows in the same transaction. An email or SMS channel will instead
// queue its sends in an outbox for a worker to deliver after commit, so a slow
// provider never blocks the change that caused the notification.
type Channel interface {
	Deliver(ctx context.Context, tx pgx.Tx, notificationID string, recipients []string) error
}

type inAppChannel struct{}

func (inAppChannel) Deliver(ctx context.Context, tx pgx.Tx, notificationID string, recipients []string) error {
	_, err := tx.Exec(ctx, `INSERT INTO notification_recipients (notification_id, user_id, created_at)
		SELECT n.id, recipient, n.created_at
		FROM notifications n, unnest($2::text[]::uuid[]) AS recipient
		WHERE n.id = $1`, notificationID, recipients)
	return err
}
