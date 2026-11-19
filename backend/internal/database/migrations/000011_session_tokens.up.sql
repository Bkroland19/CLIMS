BEGIN;

ALTER TABLE users
    ADD COLUMN last_login_at timestamptz,
    ADD COLUMN login_count integer NOT NULL DEFAULT 0 CHECK (login_count >= 0);

-- Sessions own their tokens: access tokens name the session, and the session stores only the SHA-256
-- of its current refresh token. Each refresh rotates it; the previous hash detects a replayed token.
ALTER TABLE user_sessions
    ADD COLUMN refresh_token_hash bytea UNIQUE,
    ADD COLUMN previous_refresh_token_hash bytea,
    ADD COLUMN refreshed_at timestamptz,
    ADD COLUMN refresh_count integer NOT NULL DEFAULT 0 CHECK (refresh_count >= 0);

CREATE INDEX user_sessions_previous_refresh_idx ON user_sessions (previous_refresh_token_hash)
    WHERE previous_refresh_token_hash IS NOT NULL;

COMMIT;
