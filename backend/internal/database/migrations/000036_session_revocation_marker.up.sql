BEGIN;

-- When identity sync last ended this account's sessions (POST /sessions/revoke). A portal sign-in
-- whose ID token was issued at or before this time is refused, so a sign-in that straddles the
-- revoke cannot leave a live session behind.
ALTER TABLE users ADD COLUMN sessions_revoked_at timestamptz;

COMMIT;
