BEGIN;

-- Drops the uniqueness rules. Renamed usernames and cleared phone numbers are restored from their
-- previous values, which may make them shared again.
DROP TRIGGER users_resolve_legacy_identifiers ON users;
DROP FUNCTION resolve_legacy_identifier_conflicts();
DROP INDEX users_phone_unique;
DROP INDEX users_username_unique;

UPDATE users SET username = previous_username WHERE previous_username IS NOT NULL;
UPDATE users SET phone_number = previous_phone_number WHERE previous_phone_number IS NOT NULL;

ALTER TABLE users DROP COLUMN previous_username, DROP COLUMN previous_phone_number;
DROP FUNCTION normalize_phone(text);

COMMIT;
