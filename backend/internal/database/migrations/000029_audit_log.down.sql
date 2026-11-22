BEGIN;

LOCK TABLE audit_log, audit_log_subjects IN ACCESS EXCLUSIVE MODE;

-- Rolling back would destroy the audit trail.
DO $$
BEGIN
    IF EXISTS (SELECT FROM audit_log) THEN
        RAISE EXCEPTION 'The audit log has entries; export it before rolling back';
    END IF;
END;
$$;

DELETE FROM permissions WHERE name = 'audit:read';

ALTER TABLE user_sessions DROP COLUMN last_ip_address, DROP COLUMN last_user_agent;

DROP TABLE audit_log_subjects, audit_log;
DROP FUNCTION audit_log_append_only();

COMMIT;
