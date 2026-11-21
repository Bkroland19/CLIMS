-- Central in-app notifications (docs/adr/0002-notification-service.md).
BEGIN;

LOCK TABLE notifications IN ACCESS EXCLUSIVE MODE;

-- Laravel's notifications table was never used (empty in the legacy backup); its name is reused.
DO $$
BEGIN
    IF EXISTS (SELECT FROM notifications) THEN
        RAISE EXCEPTION 'The legacy notifications table has rows; export them before migrating';
    END IF;
END;
$$;

DROP TABLE notifications;

-- One row per send: the rendered text is stored once, however many people receive it.
CREATE TABLE notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    type varchar(100) NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    resource_type varchar(50),
    resource_id uuid,
    actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
    data jsonb NOT NULL DEFAULT '{}',
    idempotency_key text,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK ((resource_type IS NULL) = (resource_id IS NULL))
);

-- A repeated send with the same key (for example a retried request) is ignored.
CREATE UNIQUE INDEX notifications_idempotency_idx ON notifications (type, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

-- One row per person who receives a notification, with their read state.
CREATE TABLE notification_recipients (
    notification_id uuid NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- Copied from the notification so the inbox can sort without a join.
    created_at timestamptz NOT NULL,
    read_at timestamptz,
    PRIMARY KEY (notification_id, user_id)
);

CREATE INDEX notification_recipients_inbox_idx
    ON notification_recipients (user_id, created_at DESC, notification_id DESC);
CREATE INDEX notification_recipients_unread_idx
    ON notification_recipients (user_id) WHERE read_at IS NULL;

COMMIT;
