BEGIN;

DROP TRIGGER users_import_legacy_role ON users;
DROP FUNCTION import_legacy_user_role();

ALTER TABLE role_user DROP CONSTRAINT role_user_user_id_fkey, DROP CONSTRAINT role_user_role_id_fkey;
ALTER TABLE role_permission DROP CONSTRAINT role_permission_role_id_fkey;

-- Preserve source identifiers for old dump references while promoting the
-- UUIDs already used by the RBAC foreign keys.
DO $$
DECLARE
    table_name text;
BEGIN
    FOREACH table_name IN ARRAY ARRAY['users', 'roles']
    LOOP
        EXECUTE format('ALTER TABLE %I ALTER COLUMN id DROP IDENTITY, DROP CONSTRAINT %I', table_name, table_name || '_pkey');
        EXECUTE format('ALTER TABLE %I RENAME COLUMN id TO legacy_id', table_name);
        EXECUTE format('ALTER TABLE %I ALTER COLUMN legacy_id DROP NOT NULL, ALTER COLUMN legacy_id TYPE text, ADD UNIQUE (legacy_id)', table_name);
        EXECUTE format('ALTER TABLE %I RENAME COLUMN rbac_id TO id', table_name);
        EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I, ADD PRIMARY KEY (id)', table_name, table_name || '_rbac_id_key');
    END LOOP;

    FOREACH table_name IN ARRAY ARRAY[
        'condom_inventories', 'condoms', 'evidence', 'failed_jobs', 'hot_spot_stocks',
        'hot_spots', 'hotspot_user_mappings', 'migrations', 'orders', 'organization_units',
        'personal_access_tokens', 'transactions', 'unit_of_measures', 'user_notifications'
    ]
    LOOP
        EXECUTE format('ALTER TABLE %I ALTER COLUMN id DROP IDENTITY, DROP CONSTRAINT %I', table_name, table_name || '_pkey');
        EXECUTE format('ALTER TABLE %I RENAME COLUMN id TO legacy_id', table_name);
        EXECUTE format('ALTER TABLE %I ALTER COLUMN legacy_id DROP NOT NULL, ALTER COLUMN legacy_id TYPE text, ADD UNIQUE (legacy_id), ADD COLUMN id uuid PRIMARY KEY DEFAULT gen_random_uuid()', table_name);
    END LOOP;
END;
$$;

ALTER TABLE role_user
    ADD FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    ADD FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE;
ALTER TABLE role_permission
    ADD FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE;

ALTER TABLE notifications ALTER COLUMN id TYPE uuid USING id::uuid,
    ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- Assignments have already been backfilled by migration 3.
ALTER TABLE users DROP COLUMN role;

COMMIT;
