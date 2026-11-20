-- Hotspot workflow on the draft 5 hot_spots shape, as agreed with the team.
--
-- status is only ever 'active' or 'inactive'. review_status records the
-- workflow step: submitted and rejected hotspots are inactive, deactivated ones
-- too. hot_spots is reshaped in place so references from orders, inventory and
-- users keep their UUIDs. Every pre-migration row (legacy and those submitted
-- through migrations 8 and 9) is archived unchanged in legacy_hot_spots, which
-- is also where the legacy seed importer writes. import_legacy_hot_spots()
-- converts archived rows and is idempotent.
BEGIN;
SET LOCAL standard_conforming_strings = on;

CREATE TABLE legacy_hot_spots (LIKE hot_spots INCLUDING DEFAULTS);
ALTER TABLE legacy_hot_spots ADD PRIMARY KEY (id), ADD UNIQUE (legacy_id),
    -- Lets the down migration detect workflow activity after archiving.
    ADD COLUMN archived_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP;
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

-- Columns stay nullable for legacy rows; the API requires most of them.
ALTER TABLE hot_spots
    DROP CONSTRAINT hot_spot_activation_state,
    DROP CONSTRAINT hot_spots_submitted_by_id_fkey,
    ALTER COLUMN hid DROP NOT NULL,
    DROP COLUMN mapped_on, DROP COLUMN mapped_by, DROP COLUMN type, DROP COLUMN name,
    DROP COLUMN district, DROP COLUMN division, DROP COLUMN village,
    DROP COLUMN contact_person_id, DROP COLUMN contact_person_name, DROP COLUMN contact_person_telephone,
    DROP COLUMN status, DROP COLUMN has_condom_dispenser, DROP COLUMN dispenser_condition,
    DROP COLUMN comment, DROP COLUMN latitude, DROP COLUMN longtitude, DROP COLUMN entered_by,
    DROP COLUMN entry_date, DROP COLUMN last_modified, DROP COLUMN modified_by, DROP COLUMN rejection_reason,
    ADD COLUMN name varchar(100),
    ADD COLUMN type varchar(100),
    ADD COLUMN village varchar(100),
    ADD COLUMN subcounty_id uuid,
    ADD COLUMN latitude numeric CHECK (latitude BETWEEN -90 AND 90),
    ADD COLUMN longitude numeric CHECK (longitude BETWEEN -180 AND 180),
    ADD COLUMN has_condom_dispenser boolean,
    ADD COLUMN dispenser_condition varchar(255),
    -- NULL only until import_legacy_hot_spots() converts the row below.
    ADD COLUMN status varchar(10),
    ADD COLUMN review_status varchar(20),
    ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP,
    ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP,
    -- Legacy submitters can be removed; their hotspots remain.
    ADD CONSTRAINT hot_spots_submitted_by_id_fkey FOREIGN KEY (submitted_by_id)
        REFERENCES users(id) ON DELETE SET NULL,
    ADD CONSTRAINT hot_spots_subcounty_district_check CHECK (subcounty_id IS NULL OR district_id IS NOT NULL),
    ADD CONSTRAINT hot_spots_subcounty_fkey FOREIGN KEY (subcounty_id, district_id)
        REFERENCES subcounties(id, district_id);

DROP INDEX hot_spots_district_idx, hot_spots_submitted_by_idx;
CREATE INDEX hot_spots_district_updated_idx ON hot_spots (district_id, updated_at DESC, id);
CREATE INDEX hot_spots_submitted_by_updated_idx ON hot_spots (submitted_by_id, updated_at DESC, id);
-- Supports the "no duplicate name in the same village" rule. Legacy data already
-- contains duplicates, so the API enforces the rule instead of a unique index.
CREATE INDEX hot_spots_village_name_idx ON hot_spots (subcounty_id, hot_spot_label(village), hot_spot_label(name));

-- The contact person is the hotspot manager. Earlier contacts are kept as history.
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

-- A hotspot can have several comments. Activation, deactivation and rejection
-- record the DCFP's required comment with that action.
CREATE TABLE hot_spot_comments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    hot_spot_id uuid NOT NULL REFERENCES hot_spots(id) ON DELETE CASCADE,
    user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    action varchar(20) NOT NULL DEFAULT 'comment'
        CHECK (action IN ('comment', 'activated', 'deactivated', 'rejected')),
    comment text NOT NULL CHECK (btrim(comment) <> ''),
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX hot_spot_comments_hot_spot_idx ON hot_spot_comments (hot_spot_id, created_at, id);

CREATE INDEX hot_spot_events_hot_spot_idx ON hot_spot_events (hot_spot_id, created_at, id);

-- The seed importer stages same-named temp tables; search public first.
CREATE FUNCTION import_legacy_hot_spots() RETURNS void
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
    -- The archive was just filled; without statistics the planner assumes it is
    -- tiny and matches subcounties with a nested loop over every hotspot.
    ANALYZE legacy_hot_spots, hot_spots;

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

    -- DCFPs act on their district's hotspots through its store.
    UPDATE users u SET store_id = s.id
    FROM stores s
    WHERE u.store_id IS NULL AND s.store_type = 'district' AND s.code = btrim(u.district)
      AND EXISTS (SELECT 1 FROM role_user ru JOIN roles r ON r.id = ru.role_id
                  WHERE ru.user_id = u.id AND r.name = 'dfcp');

    WITH district_labels AS MATERIALIZED (
        SELECT id, name, hot_spot_label(name) AS label FROM districts
    ), src AS (
        SELECT h.*, coalesce(h.district_id, by_uid.id, by_name.id) AS matched_district_id,
            -- Rows from the migration 8/9 workflow have a submitter; others are legacy.
            CASE WHEN h.submitted_by_id IS NOT NULL THEN
                CASE h.status WHEN 'active' THEN 'active' WHEN 'rejected' THEN 'rejected' ELSE 'submitted' END
            WHEN lower(btrim(h.status)) = 'active' THEN 'active'
            ELSE 'deactivated' END AS converted_review_status
        FROM legacy_hot_spots h
        LEFT JOIN districts by_uid ON by_uid.uid = btrim(h.district)
        LEFT JOIN LATERAL (
            SELECT d.id FROM district_labels d
            WHERE h.district_id IS NULL AND by_uid.id IS NULL
              AND d.label IN (hot_spot_label(h.district), hot_spot_label(h.district) || ' district')
            ORDER BY d.name LIMIT 1
        ) by_name ON true
        -- Two lookups rather than one OR, so each can use its unique index.
        WHERE NOT EXISTS (SELECT 1 FROM hot_spots p WHERE p.id = h.id AND p.status IS NOT NULL)
          AND NOT EXISTS (SELECT 1 FROM hot_spots p WHERE p.legacy_id = h.legacy_id AND p.status IS NOT NULL)
    ), matched_subcounty AS (
        -- Accept a subcounty only when exactly one in the district fits. Legacy
        -- text was cut at 20 characters, so a 20-character value may be a prefix.
        SELECT src.id, min(s.id::text)::uuid AS subcounty_id
        FROM src JOIN subcounties s ON s.district_id = src.matched_district_id
        WHERE hot_spot_label(src.division) <> ''
          AND (hot_spot_label(s.name) = hot_spot_label(src.division)
               OR (length(src.division) = 20
                   AND starts_with(hot_spot_label(s.name), hot_spot_label(src.division)))
               OR hot_spot_subcounty_base(s.name) = hot_spot_subcounty_base(src.division))
        GROUP BY src.id
        HAVING count(*) = 1
    ), converted AS (
        INSERT INTO hot_spots (
            id, legacy_id, hid, name, type, village, district_id, subcounty_id, submitted_by_id,
            latitude, longitude, has_condom_dispenser, dispenser_condition, status, review_status,
            created_at, updated_at)
        SELECT src.id, src.legacy_id, nullif(src.hid, ''), nullif(btrim(src.name), ''),
            nullif(btrim(src.type), ''), nullif(btrim(src.village), ''), src.matched_district_id,
            m.subcounty_id, coalesce(src.submitted_by_id, u.id),
            CASE WHEN btrim(src.latitude) ~ '^-?[0-9]{1,3}(\.[0-9]+)?$' THEN
                CASE WHEN btrim(src.latitude)::numeric BETWEEN -90 AND 90 THEN btrim(src.latitude)::numeric END END,
            CASE WHEN btrim(src.longtitude) ~ '^-?[0-9]{1,3}(\.[0-9]+)?$' THEN
                CASE WHEN btrim(src.longtitude)::numeric BETWEEN -180 AND 180 THEN btrim(src.longtitude)::numeric END END,
            CASE WHEN lower(btrim(src.has_condom_dispenser)) IN ('yes', 'y', 'has') THEN true
                 WHEN lower(btrim(src.has_condom_dispenser)) IN ('no', 'n', 'non') THEN false END,
            nullif(btrim(src.dispenser_condition), ''),
            CASE WHEN src.converted_review_status = 'active' THEN 'active' ELSE 'inactive' END,
            src.converted_review_status,
            coalesce(src.created_at, CURRENT_TIMESTAMP),
            coalesce(src.updated_at, src.created_at, CURRENT_TIMESTAMP)
        FROM src
        LEFT JOIN matched_subcounty m ON m.id = src.id
        LEFT JOIN users u ON u.legacy_id = btrim(src.entered_by)
        -- Rows reshaped by this migration already exist with the same UUID.
        ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name, type = EXCLUDED.type, village = EXCLUDED.village,
            district_id = EXCLUDED.district_id, subcounty_id = EXCLUDED.subcounty_id,
            submitted_by_id = EXCLUDED.submitted_by_id, latitude = EXCLUDED.latitude,
            longitude = EXCLUDED.longitude, has_condom_dispenser = EXCLUDED.has_condom_dispenser,
            dispenser_condition = EXCLUDED.dispenser_condition, status = EXCLUDED.status,
            review_status = EXCLUDED.review_status,
            created_at = EXCLUDED.created_at, updated_at = EXCLUDED.updated_at
        WHERE hot_spots.status IS NULL
        RETURNING id, submitted_by_id, created_at, updated_at
    ), contacts AS (
        INSERT INTO contact_persons (name, phone_number, hot_spot_id, created_at, updated_at)
        SELECT nullif(btrim(h.contact_person_name), ''), nullif(btrim(h.contact_person_telephone), ''),
            c.id, c.created_at, c.created_at
        FROM converted c JOIN legacy_hot_spots h ON h.id = c.id
        WHERE coalesce(btrim(h.contact_person_name), '') <> ''
           OR coalesce(btrim(h.contact_person_telephone), '') <> ''
    ), rejections AS (
        -- Migration 9 kept the DCFP's reason on the hotspot; it becomes their comment.
        INSERT INTO hot_spot_comments (hot_spot_id, user_id, action, comment, created_at, updated_at)
        SELECT c.id, e.actor_id, 'rejected', btrim(h.rejection_reason),
            coalesce(e.created_at::timestamp, c.updated_at), coalesce(e.created_at::timestamp, c.updated_at)
        FROM converted c JOIN legacy_hot_spots h ON h.id = c.id
        LEFT JOIN LATERAL (SELECT actor_id, created_at FROM hot_spot_events
                           WHERE hot_spot_id = c.id AND action = 'reject'
                           ORDER BY created_at DESC LIMIT 1) e ON true
        WHERE coalesce(btrim(h.rejection_reason), '') <> ''
    )
    INSERT INTO hot_spot_comments (hot_spot_id, user_id, action, comment, created_at, updated_at)
    SELECT c.id, c.submitted_by_id, 'comment', btrim(h.comment), c.created_at, c.created_at
    FROM converted c JOIN legacy_hot_spots h ON h.id = c.id
    WHERE coalesce(btrim(h.comment), '') <> '';

    -- Seeded users arrive before their hotspots are converted, so resolve the
    -- assigned hotspot here with the same exactly-one-row rule as migration 5.
    UPDATE users u SET hot_spot_id = (
        SELECT CASE WHEN count(*) = 1 THEN (array_agg(h.id))[1] END FROM hot_spots h
        WHERE h.hid = btrim(u.hotspot_id) OR h.legacy_id = btrim(u.hotspot_id))
    WHERE u.hot_spot_id IS NULL AND nullif(btrim(u.hotspot_id), '') IS NOT NULL;
END;
$$;

SELECT import_legacy_hot_spots();

ALTER TABLE hot_spots
    ALTER COLUMN status SET NOT NULL,
    ALTER COLUMN status SET DEFAULT 'inactive',
    ALTER COLUMN review_status SET NOT NULL,
    ALTER COLUMN review_status SET DEFAULT 'submitted',
    ADD CONSTRAINT hot_spots_status_check CHECK (status IN ('active', 'inactive')),
    ADD CONSTRAINT hot_spots_review_status_check
        CHECK (review_status IN ('submitted', 'rejected', 'active', 'deactivated')),
    -- Only an active review state is an active hotspot.
    ADD CONSTRAINT hot_spots_status_consistent CHECK ((status = 'active') = (review_status = 'active')),
    ALTER COLUMN created_at SET NOT NULL,
    ALTER COLUMN updated_at SET NOT NULL;

-- Converted legacy hotspots that need manual data cleanup, alongside the original text.
CREATE VIEW hot_spot_cleanup AS
SELECT p.id AS hot_spot_id, p.legacy_id, p.name, p.status,
    h.district AS legacy_district, h.division AS legacy_subcounty, h.village AS legacy_village,
    d.name AS matched_district,
    p.district_id IS NULL AS district_missing,
    p.subcounty_id IS NULL AS subcounty_missing,
    p.name IS NULL AS name_missing,
    (p.latitude IS NULL OR p.longitude IS NULL) AS gps_missing
FROM hot_spots p
JOIN legacy_hot_spots h ON h.id = p.id
LEFT JOIN districts d ON d.id = p.district_id
WHERE p.legacy_id IS NOT NULL
  AND (p.district_id IS NULL OR p.subcounty_id IS NULL OR p.name IS NULL
       OR p.latitude IS NULL OR p.longitude IS NULL);

UPDATE permissions SET description = 'Activate, reject and deactivate hotspots in the district of your assigned store'
WHERE name = 'hotspots:activate';

COMMIT;
