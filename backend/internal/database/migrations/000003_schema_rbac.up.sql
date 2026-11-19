BEGIN;

ALTER TABLE users ADD COLUMN rbac_id uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE;
ALTER TABLE roles ADD COLUMN rbac_id uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    ADD COLUMN description varchar,
    ADD CONSTRAINT roles_name_unique UNIQUE (name);

ALTER TABLE permissions RENAME COLUMN code TO name;
ALTER TABLE permissions ADD COLUMN id uuid NOT NULL DEFAULT gen_random_uuid(),
    ADD COLUMN created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE role_permissions DROP CONSTRAINT role_permissions_permission_code_fkey;
ALTER TABLE permissions DROP CONSTRAINT permissions_pkey,
    ADD PRIMARY KEY (id),
    ADD CONSTRAINT permissions_name_unique UNIQUE (name);

CREATE TABLE role_permission (
    role_id uuid NOT NULL REFERENCES roles(rbac_id) ON DELETE CASCADE,
    permission_id uuid NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (role_id, permission_id)
);

INSERT INTO role_permission (role_id, permission_id)
SELECT r.rbac_id, p.id
FROM role_permissions rp
JOIN roles r ON r.id = rp.role_id
JOIN permissions p ON p.name = rp.permission_code;

DROP TABLE role_permissions;
CREATE TABLE role_user (
    user_id uuid NOT NULL REFERENCES users(rbac_id) ON DELETE CASCADE,
    role_id uuid NOT NULL REFERENCES roles(rbac_id) ON DELETE CASCADE,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, role_id)
);
CREATE INDEX role_user_role_id_idx ON role_user (role_id);
CREATE INDEX role_permission_permission_id_idx ON role_permission (permission_id);

INSERT INTO role_user (user_id, role_id)
SELECT u.rbac_id, r.rbac_id
FROM users u JOIN roles r ON r.id::text = u.role;

-- The legacy seed can still be imported after all migrations have run.
CREATE FUNCTION import_legacy_user_role() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO role_user (user_id, role_id)
    SELECT NEW.rbac_id, rbac_id FROM roles WHERE id::text = NEW.role;
    RETURN NEW;
END;
$$;

CREATE TRIGGER users_import_legacy_role AFTER INSERT ON users
FOR EACH ROW WHEN (NEW.role <> '') EXECUTE FUNCTION import_legacy_user_role();

COMMIT;
