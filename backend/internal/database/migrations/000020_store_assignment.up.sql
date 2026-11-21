-- Store assignment: a second national warehouse, and stores for accounts that
-- lack one.
--
-- An account's store decides which orders and stock it works with. National
-- Medical Stores joins the Joint Medical Store seeded by migration 6.
-- assign_user_stores() fills in a missing store from the account's role and
-- legacy district; the legacy seed importer calls it too. It never replaces a
-- store that is already set.
BEGIN;

INSERT INTO stores (code, name, store_type) VALUES ('nms', 'National Medical Stores', 'national')
ON CONFLICT (code) DO NOTHING;

CREATE FUNCTION assign_user_stores() RETURNS void
LANGUAGE sql SET search_path = public, pg_temp AS $$
    -- Warehouse staff work at the warehouse their role is named after.
    UPDATE users u SET store_id = s.id
    FROM role_user ru
    JOIN roles r ON r.id = ru.role_id
    JOIN stores s ON s.store_type = 'national' AND s.code = r.name
    WHERE u.store_id IS NULL AND ru.user_id = u.id AND r.name IN ('nms', 'jms');

    -- District focal persons and delivery agents work at their district's store,
    -- which legacy accounts name by the district's DHIS2 UID.
    UPDATE users u SET store_id = s.id
    FROM stores s
    WHERE u.store_id IS NULL AND s.store_type = 'district' AND s.code = btrim(u.district)
      AND EXISTS (SELECT 1 FROM role_user ru JOIN roles r ON r.id = ru.role_id
                  WHERE ru.user_id = u.id AND r.name IN ('dfcp', 'dcfp', 'delivery agent'));
$$;

SELECT assign_user_stores();

COMMIT;
