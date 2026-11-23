-- Push notifications to the field app through Firebase Cloud Messaging (docs/modules/notifications.md#push).
BEGIN;

-- One row per phone that asked for push. A device belongs to the session that registered it: signing
-- out or revoking the session stops its pushes, and a phone that signs in as someone else takes its
-- token with it.
CREATE TABLE push_devices (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    token text NOT NULL UNIQUE CHECK (length(token) BETWEEN 1 AND 4096),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id uuid NOT NULL REFERENCES user_sessions(id) ON DELETE CASCADE,
    platform varchar(20) NOT NULL CHECK (platform IN ('android', 'ios')),
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX push_devices_user_idx ON push_devices (user_id);
CREATE INDEX push_devices_session_idx ON push_devices (session_id);

-- Pushes waiting to be sent, one per notification and device. Notify writes them in the transaction
-- of the change; a worker sends them after commit, so a slow or unreachable Firebase never blocks the
-- change. The text is rendered at send time and kept here, as the push may say less than the inbox.
CREATE TABLE push_outbox (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_id uuid NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token text NOT NULL REFERENCES push_devices(token) ON DELETE CASCADE,
    title text NOT NULL,
    body text NOT NULL,
    attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    next_attempt_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (notification_id, token)
);

CREATE INDEX push_outbox_due_idx ON push_outbox (next_attempt_at, created_at);

COMMIT;
