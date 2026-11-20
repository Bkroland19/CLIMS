BEGIN;

-- Refresh tokens stop working; users sign in again when their access token expires.
DROP INDEX user_sessions_previous_refresh_idx;
ALTER TABLE user_sessions
    DROP COLUMN refresh_token_hash,
    DROP COLUMN previous_refresh_token_hash,
    DROP COLUMN refreshed_at,
    DROP COLUMN refresh_count;
ALTER TABLE users DROP COLUMN last_login_at, DROP COLUMN login_count;

COMMIT;
