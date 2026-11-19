BEGIN;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM role_user GROUP BY user_id HAVING count(*) > 1) THEN
        RAISE EXCEPTION 'Cannot roll back RBAC while a user holds multiple roles';
    END IF;
END;
$$;

DROP TRIGGER users_import_legacy_role ON users;
DROP FUNCTION import_legacy_user_role();

UPDATE users u SET role = COALESCE((
    SELECT r.id::text FROM role_user ru JOIN roles r ON r.rbac_id = ru.role_id
    WHERE ru.user_id = u.rbac_id
), CASE
    WHEN EXISTS (SELECT 1 FROM roles r WHERE r.id::text = u.role) THEN ''
    ELSE u.role
END);

CREATE TABLE role_permissions (
    role_id bigint NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_code text NOT NULL,
    PRIMARY KEY (role_id, permission_code)
);

INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, p.name FROM role_permission rp
JOIN roles r ON r.rbac_id = rp.role_id
JOIN permissions p ON p.id = rp.permission_id;

DROP TABLE role_permission;
DROP TABLE role_user;
ALTER TABLE permissions DROP CONSTRAINT permissions_pkey,
    DROP COLUMN id, DROP COLUMN created_at, DROP COLUMN updated_at;
ALTER TABLE permissions DROP CONSTRAINT permissions_name_unique;
ALTER TABLE permissions RENAME COLUMN name TO code;
ALTER TABLE permissions ADD PRIMARY KEY (code);
ALTER TABLE role_permissions ADD FOREIGN KEY (permission_code) REFERENCES permissions(code) ON DELETE CASCADE;
ALTER TABLE roles DROP COLUMN rbac_id, DROP COLUMN description, DROP CONSTRAINT roles_name_unique;
ALTER TABLE users DROP COLUMN rbac_id;

COMMIT;
