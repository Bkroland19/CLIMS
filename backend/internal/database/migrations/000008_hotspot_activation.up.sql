-- Hotspot mapping and activation on the draft 5 hot_spots shape.
--
-- hot_spots is reshaped in place so existing references (orders,
-- order_hot_spot_routes, users.hot_spot_id) keep their UUIDs. The original
-- rows are archived unchanged in legacy_hot_spots, which is also where the
-- legacy seed importer writes. import_legacy_hot_spots() converts archived
-- rows and is idempotent, so the same conversion serves databases seeded
-- before this migration and backups imported after it.
BEGIN;
SET LOCAL standard_conforming_strings = on;

CREATE TABLE legacy_hot_spots (LIKE hot_spots INCLUDING DEFAULTS INCLUDING CONSTRAINTS);
ALTER TABLE legacy_hot_spots ADD PRIMARY KEY (id), ADD UNIQUE (legacy_id);
INSERT INTO legacy_hot_spots SELECT * FROM hot_spots;

-- Case- and whitespace-insensitive comparison key for names and villages.
CREATE FUNCTION hot_spot_label(value text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
RETURN lower(regexp_replace(btrim(coalesce(value, '')), '\s+', ' ', 'g'));

-- Subcounty name without its administrative suffix, for matching legacy free text.
CREATE FUNCTION hot_spot_subcounty_base(value text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
RETURN btrim(regexp_replace(hot_spot_label(value),
    '\s*(sub[- ]?county|s/c|town council|t/c|tc|division|municipality)$', ''));

CREATE TABLE subcounties (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    uid varchar NOT NULL UNIQUE,
    name varchar NOT NULL,
    district_id uuid NOT NULL REFERENCES districts(id),
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Target of the hot_spots composite key that keeps subcounty and district consistent.
    UNIQUE (id, district_id)
);
CREATE INDEX subcounties_district_id_idx ON subcounties (district_id);

-- district_id is an agreed addition to draft 5: most legacy hotspots have no
-- recognizable subcounty but do have a district, which scopes DCFP access.
-- Columns stay nullable for legacy rows; the API requires them.
ALTER TABLE hot_spots
    ALTER COLUMN hid DROP NOT NULL,
    DROP COLUMN mapped_on, DROP COLUMN mapped_by, DROP COLUMN type, DROP COLUMN name,
    DROP COLUMN district, DROP COLUMN division, DROP COLUMN village,
    DROP COLUMN contact_person_id, DROP COLUMN contact_person_name, DROP COLUMN contact_person_telephone,
    DROP COLUMN status, DROP COLUMN has_condom_dispenser, DROP COLUMN dispenser_condition,
    DROP COLUMN comment, DROP COLUMN latitude, DROP COLUMN longtitude, DROP COLUMN entered_by,
    DROP COLUMN entry_date, DROP COLUMN last_modified, DROP COLUMN modified_by,
    ADD COLUMN name varchar(100),
    ADD COLUMN type varchar(100),
    ADD COLUMN village varchar(100),
    ADD COLUMN district_id uuid REFERENCES districts(id),
    ADD COLUMN subcounty_id uuid,
    ADD COLUMN entered_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN latitude numeric CHECK (latitude BETWEEN -90 AND 90),
    ADD COLUMN longitude numeric CHECK (longitude BETWEEN -180 AND 180),
    ADD COLUMN has_condom_dispenser boolean,
    ADD COLUMN dispenser_condition varchar(255),
    -- NULL only until import_legacy_hot_spots() converts the row below.
    ADD COLUMN status varchar(10),
    ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP,
    ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP,
    ADD CONSTRAINT hot_spots_subcounty_district_check CHECK (subcounty_id IS NULL OR district_id IS NOT NULL),
    ADD CONSTRAINT hot_spots_subcounty_fkey FOREIGN KEY (subcounty_id, district_id)
        REFERENCES subcounties(id, district_id);

CREATE INDEX hot_spots_district_updated_idx ON hot_spots (district_id, updated_at DESC, id);
CREATE INDEX hot_spots_entered_by_updated_idx ON hot_spots (entered_by_id, updated_at DESC, id);
-- Supports the "no duplicate name in the same village" rule. Legacy data already
-- contains duplicates, so the API enforces the rule instead of a unique index.
CREATE INDEX hot_spots_village_name_idx ON hot_spots (subcounty_id, hot_spot_label(village), hot_spot_label(name));

CREATE TABLE contact_persons (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name varchar(100),
    phone_number varchar(20),
    hot_spot_id uuid NOT NULL REFERENCES hot_spots(id) ON DELETE CASCADE,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (name IS NOT NULL OR phone_number IS NOT NULL)
);
CREATE INDEX contact_persons_hot_spot_idx ON contact_persons (hot_spot_id, created_at DESC);

-- Hotspot managers. users.hot_spot_id stays the user's primary hotspot.
CREATE TABLE hot_spot_user (
    hot_spot_id uuid NOT NULL REFERENCES hot_spots(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (hot_spot_id, user_id)
);
CREATE INDEX hot_spot_user_user_id_idx ON hot_spot_user (user_id);

-- Addition to draft 5: a hotspot can have several comments. Activation and
-- deactivation record the DCFP's required comment with that action.
CREATE TABLE hot_spot_comments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    hot_spot_id uuid NOT NULL REFERENCES hot_spots(id) ON DELETE CASCADE,
    user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    action varchar(20) NOT NULL DEFAULT 'comment' CHECK (action IN ('comment', 'activated', 'deactivated')),
    comment text NOT NULL CHECK (btrim(comment) <> ''),
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX hot_spot_comments_hot_spot_idx ON hot_spot_comments (hot_spot_id, created_at, id);

-- Workflow history and the persisted in-app inbox, mirroring order_events.
-- A notification service can deliver push/SMS from rows with a recipient.
CREATE TABLE hot_spot_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    hot_spot_id uuid NOT NULL REFERENCES hot_spots(id) ON DELETE CASCADE,
    actor_id uuid NOT NULL REFERENCES users(id),
    action text NOT NULL,
    status text NOT NULL,
    notify_store_id uuid REFERENCES stores(id),
    notify_user_id uuid REFERENCES users(id),
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX hot_spot_events_hot_spot_idx ON hot_spot_events (hot_spot_id, created_at, id);
CREATE INDEX hot_spot_events_store_idx ON hot_spot_events (notify_store_id, created_at DESC, id DESC) WHERE notify_store_id IS NOT NULL;
CREATE INDEX hot_spot_events_user_idx ON hot_spot_events (notify_user_id, created_at DESC, id DESC) WHERE notify_user_id IS NOT NULL;

-- The seed importer stages same-named temp tables; search public first.
CREATE FUNCTION import_legacy_hot_spots() RETURNS void
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
    -- Organisation units carry the DHIS2 region/district/subcounty hierarchy.
    -- The 'jms' and 'nms' rows are national-warehouse placeholders, not places.
    INSERT INTO regions (uid, name)
    SELECT region_uid, min(region) FROM organization_units
    WHERE district_uid NOT IN ('jms', 'nms') GROUP BY region_uid
    ON CONFLICT (uid) DO NOTHING;

    INSERT INTO districts (uid, name, region_id)
    SELECT d.uid, d.name, r.id
    FROM (SELECT district_uid AS uid, min(district) AS name, min(region_uid) AS region_uid
          FROM organization_units WHERE district_uid NOT IN ('jms', 'nms') GROUP BY district_uid) d
    JOIN regions r ON r.uid = d.region_uid
    ON CONFLICT (uid) DO NOTHING;

    INSERT INTO subcounties (uid, name, district_id)
    SELECT s.uid, s.name, d.id
    FROM (SELECT subcounty_uid AS uid, min(subcounty) AS name, min(district_uid) AS district_uid
          FROM organization_units WHERE district_uid NOT IN ('jms', 'nms') GROUP BY subcounty_uid) s
    JOIN districts d ON d.uid = s.district_uid
    ON CONFLICT (uid) DO NOTHING;

    -- One store per district; legacy users reference it by district UID.
    INSERT INTO stores (code, name, store_type, district_id)
    SELECT d.uid, d.name, 'district', d.id FROM districts d
    ON CONFLICT DO NOTHING;

    -- DCFPs receive their district's hotspot notifications through its store.
    UPDATE users u SET store_id = s.id
    FROM stores s
    WHERE u.store_id IS NULL AND s.store_type = 'district' AND s.code = btrim(u.district)
      AND EXISTS (SELECT 1 FROM role_user ru JOIN roles r ON r.id = ru.role_id
                  WHERE ru.user_id = u.id AND r.name = 'dfcp');

    WITH district_labels AS MATERIALIZED (
        SELECT id, name, hot_spot_label(name) AS label FROM districts
    ), src AS (
        SELECT h.*, coalesce(by_uid.id, by_name.id) AS matched_district_id
        FROM legacy_hot_spots h
        LEFT JOIN districts by_uid ON by_uid.uid = btrim(h.district)
        LEFT JOIN LATERAL (
            SELECT d.id FROM district_labels d
            WHERE by_uid.id IS NULL
              AND d.label IN (hot_spot_label(h.district), hot_spot_label(h.district) || ' district')
            ORDER BY d.name LIMIT 1
        ) by_name ON true
        WHERE NOT EXISTS (SELECT 1 FROM hot_spots p WHERE p.legacy_id = h.legacy_id AND p.status IS NOT NULL)
    ), matched_subcounty AS (
        -- Accept a subcounty only when exactly one in the district fits. Legacy
        -- text was cut at 20 characters, so a 20-character value may be a prefix.
        SELECT src.legacy_id, min(s.id::text)::uuid AS subcounty_id
        FROM src JOIN subcounties s ON s.district_id = src.matched_district_id
        WHERE hot_spot_label(src.division) <> ''
          AND (hot_spot_label(s.name) = hot_spot_label(src.division)
               OR (length(src.division) = 20
                   AND starts_with(hot_spot_label(s.name), hot_spot_label(src.division)))
               OR hot_spot_subcounty_base(s.name) = hot_spot_subcounty_base(src.division))
        GROUP BY src.legacy_id
        HAVING count(*) = 1
    ), converted AS (
        INSERT INTO hot_spots (
            id, legacy_id, hid, name, type, village, district_id, subcounty_id, entered_by_id,
            latitude, longitude, has_condom_dispenser, dispenser_condition, status, created_at, updated_at)
        SELECT src.id, src.legacy_id, src.hid, nullif(btrim(src.name), ''), nullif(btrim(src.type), ''),
            nullif(btrim(src.village), ''), src.matched_district_id, m.subcounty_id, u.id,
            CASE WHEN btrim(src.latitude) ~ '^-?[0-9]{1,3}(\.[0-9]+)?$' THEN
                CASE WHEN btrim(src.latitude)::numeric BETWEEN -90 AND 90 THEN btrim(src.latitude)::numeric END END,
            CASE WHEN btrim(src.longtitude) ~ '^-?[0-9]{1,3}(\.[0-9]+)?$' THEN
                CASE WHEN btrim(src.longtitude)::numeric BETWEEN -180 AND 180 THEN btrim(src.longtitude)::numeric END END,
            CASE WHEN lower(btrim(src.has_condom_dispenser)) IN ('yes', 'y', 'has') THEN true
                 WHEN lower(btrim(src.has_condom_dispenser)) IN ('no', 'n', 'non') THEN false END,
            nullif(btrim(src.dispenser_condition), ''),
            CASE WHEN lower(btrim(src.status)) = 'active' THEN 'active' ELSE 'inactive' END,
            coalesce(src.created_at, CURRENT_TIMESTAMP),
            coalesce(src.updated_at, src.created_at, CURRENT_TIMESTAMP)
        FROM src
        LEFT JOIN matched_subcounty m ON m.legacy_id = src.legacy_id
        LEFT JOIN users u ON u.legacy_id = btrim(src.entered_by)
        -- Rows reshaped by this migration already exist with the same UUID.
        ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name, type = EXCLUDED.type, village = EXCLUDED.village,
            district_id = EXCLUDED.district_id, subcounty_id = EXCLUDED.subcounty_id,
            entered_by_id = EXCLUDED.entered_by_id, latitude = EXCLUDED.latitude,
            longitude = EXCLUDED.longitude, has_condom_dispenser = EXCLUDED.has_condom_dispenser,
            dispenser_condition = EXCLUDED.dispenser_condition, status = EXCLUDED.status,
            created_at = EXCLUDED.created_at, updated_at = EXCLUDED.updated_at
        WHERE hot_spots.status IS NULL
        RETURNING id, legacy_id, entered_by_id, created_at
    ), contacts AS (
        INSERT INTO contact_persons (name, phone_number, hot_spot_id, created_at, updated_at)
        SELECT nullif(btrim(h.contact_person_name), ''), nullif(btrim(h.contact_person_telephone), ''),
            c.id, c.created_at, c.created_at
        FROM converted c JOIN legacy_hot_spots h ON h.legacy_id = c.legacy_id
        WHERE coalesce(btrim(h.contact_person_name), '') <> ''
           OR coalesce(btrim(h.contact_person_telephone), '') <> ''
    )
    INSERT INTO hot_spot_comments (hot_spot_id, user_id, action, comment, created_at, updated_at)
    SELECT c.id, c.entered_by_id, 'comment', btrim(h.comment), c.created_at, c.created_at
    FROM converted c JOIN legacy_hot_spots h ON h.legacy_id = c.legacy_id
    WHERE coalesce(btrim(h.comment), '') <> '';

    -- Seeded users arrive before their hotspots are converted, so resolve the
    -- primary hotspot here with the same exactly-one-row rule as migration 5.
    UPDATE users u SET hot_spot_id = (
        SELECT CASE WHEN count(*) = 1 THEN (array_agg(h.id))[1] END FROM hot_spots h
        WHERE h.hid = btrim(u.hotspot_id) OR h.legacy_id = btrim(u.hotspot_id))
    WHERE u.hot_spot_id IS NULL AND nullif(btrim(u.hotspot_id), '') IS NOT NULL;

    INSERT INTO hot_spot_user (hot_spot_id, user_id)
    SELECT u.hot_spot_id, u.id FROM users u WHERE u.hot_spot_id IS NOT NULL
    ON CONFLICT DO NOTHING;
END;
$$;

SELECT import_legacy_hot_spots();

ALTER TABLE hot_spots
    ALTER COLUMN status SET NOT NULL,
    ALTER COLUMN status SET DEFAULT 'inactive',
    ADD CONSTRAINT hot_spots_status_check CHECK (status IN ('active', 'inactive')),
    ALTER COLUMN created_at SET NOT NULL,
    ALTER COLUMN updated_at SET NOT NULL;

-- Converted hotspots that need manual data cleanup, alongside the original text.
CREATE VIEW hot_spot_cleanup AS
SELECT p.id AS hot_spot_id, p.legacy_id, p.name, p.status,
    h.district AS legacy_district, h.division AS legacy_subcounty, h.village AS legacy_village,
    d.name AS matched_district,
    p.district_id IS NULL AS district_missing,
    p.subcounty_id IS NULL AS subcounty_missing,
    p.name IS NULL AS name_missing,
    (p.latitude IS NULL OR p.longitude IS NULL) AS gps_missing
FROM hot_spots p
JOIN legacy_hot_spots h ON h.legacy_id = p.legacy_id
LEFT JOIN districts d ON d.id = p.district_id
WHERE p.district_id IS NULL OR p.subcounty_id IS NULL OR p.name IS NULL
   OR p.latitude IS NULL OR p.longitude IS NULL;

-- Grant to admin only; assign VHT and DCFP roles through the RBAC API.
INSERT INTO permissions (name, description) VALUES
    ('hotspots:read', 'View own submitted hotspots, or the district''s hotspots for verifiers'),
    ('hotspots:submit', 'Submit hotspots and edit own hotspots while inactive'),
    ('hotspots:verify', 'Comment on, activate and deactivate hotspots in the assigned district');

INSERT INTO role_permission (role_id, permission_id)
SELECT roles.id, permissions.id FROM roles CROSS JOIN permissions
WHERE roles.name = 'admin' AND permissions.name IN ('hotspots:read', 'hotspots:submit', 'hotspots:verify');

COMMIT;
