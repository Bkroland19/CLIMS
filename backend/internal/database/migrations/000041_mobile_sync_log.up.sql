-- What field phones report about sending their saved actions (docs/modules/sync-log.md).
BEGIN;

-- One row per action a phone saved, updated as the phone reports new attempts. Rows are the
-- phone's account of events, not the server's: the server's own record is in audit_log, which
-- names the same entry in details.client_entry_id when the phone's request reached the API.
CREATE TABLE mobile_sync_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- The session that uploaded the latest version of the entry.
    session_id uuid REFERENCES user_sessions(id) ON DELETE SET NULL,
    -- The phone's own ID for the entry; the phone re-sends it as it changes.
    client_entry_id varchar(64) NOT NULL CHECK (client_entry_id ~ '^[A-Za-z0-9_-]{8,64}$'),
    action varchar(30) NOT NULL CHECK (action IN
        ('notify', 'stockout', 'acknowledge', 'mapHotspot', 'confirmReceipt', 'pickup', 'deliver')),
    status varchar(20) NOT NULL CHECK (status IN
        ('waiting', 'retrying', 'sent', 'refused', 'saved_on_phone')),
    -- The hotspot, stockout report or other record the API created or changed.
    server_record_id text CHECK (length(server_record_id) <= 100),
    -- Phone clock times: when the action was saved and when the entry last changed.
    queued_at timestamptz NOT NULL,
    changed_at timestamptz NOT NULL,
    -- All attempts, though only the latest ten are kept in attempts: [{at, http_status, error}].
    attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    attempts jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(attempts) = 'array'),
    last_error varchar(100),
    platform varchar(20) NOT NULL CHECK (platform IN ('android', 'ios')),
    os_version varchar(40),
    app_version varchar(40),
    received_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, client_entry_id)
);

CREATE INDEX mobile_sync_log_time_idx ON mobile_sync_log (queued_at DESC, id DESC);
CREATE INDEX mobile_sync_log_user_idx ON mobile_sync_log (user_id, queued_at DESC);
CREATE INDEX mobile_sync_log_status_idx ON mobile_sync_log (status, queued_at DESC);

-- Finds what the server recorded for one phone entry (GET /audit?client_entry_id=).
CREATE INDEX audit_log_client_entry_idx ON audit_log ((details->>'client_entry_id'))
    WHERE details ? 'client_entry_id';

INSERT INTO permissions (name, description) VALUES
    ('sync_logs:read', 'View what field phones report about sending their saved actions');

-- MOH oversees the field programme; administrators keep every permission.
INSERT INTO role_permission (role_id, permission_id)
SELECT roles.id, permissions.id FROM roles CROSS JOIN permissions
WHERE roles.name IN ('admin', 'moh') AND permissions.name = 'sync_logs:read';

COMMIT;
