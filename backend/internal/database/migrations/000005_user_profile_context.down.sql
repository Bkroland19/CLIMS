BEGIN;

DROP TRIGGER users_resolve_legacy_context ON users;
DROP FUNCTION resolve_legacy_user_context();
ALTER TABLE users DROP COLUMN organisation_unit_id, DROP COLUMN hot_spot_id,
    DROP COLUMN subcounty_id, DROP COLUMN store_id;

COMMIT;
