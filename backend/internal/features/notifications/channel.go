package notifications

import (
	"context"

	"github.com/jackc/pgx/v5"
)

// Delivery is one recorded notification on its way to its recipients.
type Delivery struct {
	NotificationID string
	Recipients     []string
	// PushTitle and PushBody are the text a push shows.
	PushTitle, PushBody string
}

// Channel delivers a recorded notification to its recipients. In-app delivery writes inbox rows in
// the same transaction. Push (and later email or SMS) instead queues its sends in an outbox for a
// worker to deliver after commit, so a slow provider never blocks the change that caused the
// notification.
type Channel interface {
	Deliver(ctx context.Context, tx pgx.Tx, d Delivery) error
}

type inAppChannel struct{}

func (inAppChannel) Deliver(ctx context.Context, tx pgx.Tx, d Delivery) error {
	_, err := tx.Exec(ctx, `INSERT INTO notification_recipients (notification_id, user_id, created_at)
		SELECT n.id, recipient, n.created_at
		FROM notifications n, unnest($2::text[]::uuid[]) AS recipient
		WHERE n.id = $1`, d.NotificationID, d.Recipients)
	return err
}

// pushChannel queues a push for each recipient's registered devices whose session is still open.
// Recipients without a device (everyone who uses only the website) get no outbox rows.
type pushChannel struct{}

func (pushChannel) Deliver(ctx context.Context, tx pgx.Tx, d Delivery) error {
	_, err := tx.Exec(ctx, `INSERT INTO push_outbox (notification_id, user_id, token, title, body)
		SELECT $1, pd.user_id, pd.token, $3, $4
		FROM push_devices pd JOIN user_sessions s ON s.id = pd.session_id
		WHERE pd.user_id = ANY($2::text[]::uuid[])
			AND s.revoked_at IS NULL AND s.expires_at > CURRENT_TIMESTAMP
		ON CONFLICT (notification_id, token) DO NOTHING`,
		d.NotificationID, d.Recipients, d.PushTitle, d.PushBody)
	return err
}
