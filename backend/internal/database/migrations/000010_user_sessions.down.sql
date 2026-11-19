-- Dropping sessions signs nobody out by itself; tokens issued with a session id then fail authentication.
DROP TABLE user_sessions;
