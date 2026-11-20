BEGIN;

CREATE TABLE user_oidc_identities (
    issuer text NOT NULL CHECK (btrim(issuer) <> ''),
    subject text NOT NULL CHECK (btrim(subject) <> ''),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (issuer, subject),
    UNIQUE (user_id, issuer)
);

COMMIT;
