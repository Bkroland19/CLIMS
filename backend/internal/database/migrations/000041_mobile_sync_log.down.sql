BEGIN;

DELETE FROM permissions WHERE name = 'sync_logs:read';

DROP INDEX audit_log_client_entry_idx;
DROP TABLE mobile_sync_log;

COMMIT;
