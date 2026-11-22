-- Central, append-only audit log (docs/adr/0003-audit-log.md).
BEGIN;

CREATE TABLE audit_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Wall-clock time, so entries written in one transaction keep their order.
    occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    action varchar(100) NOT NULL CHECK (action ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$'),
    outcome varchar(10) NOT NULL CHECK (outcome IN ('success', 'failure')),
    reason varchar(100),
    -- No foreign key: entries outlive the accounts they mention, and the copied
    -- username and roles keep them readable.
    actor_id uuid,
    actor_username text,
    actor_roles text[] NOT NULL DEFAULT '{}',
    -- An automated job's name, when no person acted.
    system_actor varchar(100),
    target_type varchar(50),
    target_id text,
    -- Changed fields only: {"field": {"before": ..., "after": ...}}. Never secrets.
    changes jsonb,
    details jsonb NOT NULL DEFAULT '{}',
    ip_address text,
    user_agent text,
    request_id text,
    session_id uuid,
    CHECK (actor_id IS NULL OR system_actor IS NULL),
    CHECK ((target_type IS NULL) = (target_id IS NULL))
);

CREATE INDEX audit_log_time_idx ON audit_log (occurred_at DESC, id DESC);
CREATE INDEX audit_log_actor_idx ON audit_log (actor_id, occurred_at DESC) WHERE actor_id IS NOT NULL;
CREATE INDEX audit_log_action_idx ON audit_log (action, occurred_at DESC);

-- The records an entry concerns: its target and related records such as the
-- hotspot, district or store of an order. Searching here isolates one record's history.
CREATE TABLE audit_log_subjects (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    audit_id uuid NOT NULL REFERENCES audit_log(id),
    subject_type varchar(50) NOT NULL,
    subject_id text NOT NULL,
    UNIQUE (audit_id, subject_type, subject_id)
);

CREATE INDEX audit_log_subjects_subject_idx ON audit_log_subjects (subject_type, subject_id, audit_id);

-- The application, like everyone else, can only add entries.
CREATE FUNCTION audit_log_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'audit entries are append-only: % on % is not allowed', TG_OP, TG_TABLE_NAME;
END;
$$;

CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION audit_log_append_only();
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON audit_log
    FOR EACH STATEMENT EXECUTE FUNCTION audit_log_append_only();
CREATE TRIGGER audit_log_subjects_append_only BEFORE UPDATE OR DELETE ON audit_log_subjects
    FOR EACH ROW EXECUTE FUNCTION audit_log_append_only();
CREATE TRIGGER audit_log_subjects_no_truncate BEFORE TRUNCATE ON audit_log_subjects
    FOR EACH STATEMENT EXECUTE FUNCTION audit_log_append_only();

-- A session's latest address and device, so a refresh from a new one is audited
-- once rather than on every refresh after a network change.
ALTER TABLE user_sessions
    ADD COLUMN last_ip_address text,
    ADD COLUMN last_user_agent text;
UPDATE user_sessions SET last_ip_address = ip_address, last_user_agent = user_agent;

INSERT INTO permissions (name, description) VALUES
    ('audit:read', 'Search the audit log across the whole system');

INSERT INTO role_permission (role_id, permission_id)
SELECT roles.id, permissions.id FROM roles CROSS JOIN permissions
WHERE roles.name = 'admin' AND permissions.name = 'audit:read';

COMMIT;
