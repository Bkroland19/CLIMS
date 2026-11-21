-- Condom catalogue: products (condoms), brands and units of measure become
-- managed master data that can be deactivated instead of deleted.
--
-- condoms is reshaped in place so references from orders, store stock and
-- inventory movements keep their UUIDs. Every pre-migration row is archived
-- unchanged in legacy_condoms, which is also where the legacy seed importer
-- writes. import_legacy_condoms() converts archived rows and is idempotent.
--
-- Converted legacy rows may be incomplete (no brand, unit or pack size). The
-- API requires every field for new products and before a product is activated.
-- Rows whose category, type or brand cannot be recognised are deactivated.
BEGIN;
SET LOCAL standard_conforming_strings = on;

CREATE TABLE legacy_condoms (LIKE condoms INCLUDING DEFAULTS);
ALTER TABLE legacy_condoms ADD PRIMARY KEY (id), ADD UNIQUE (legacy_id);
INSERT INTO legacy_condoms SELECT * FROM condoms;

CREATE TABLE brands (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name varchar(60) NOT NULL CHECK (name = btrim(name) AND name <> ''),
    note varchar(120),
    active boolean NOT NULL DEFAULT true,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- Brand and unit names are unique regardless of case.
CREATE UNIQUE INDEX brands_name_key ON brands (lower(name));

UPDATE unit_of_measures SET created_at = coalesce(created_at, CURRENT_TIMESTAMP),
    updated_at = coalesce(updated_at, created_at, CURRENT_TIMESTAMP);
ALTER TABLE unit_of_measures
    ALTER COLUMN name TYPE varchar(40),
    ADD COLUMN note varchar(120),
    ADD COLUMN active boolean NOT NULL DEFAULT true,
    ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP,
    ALTER COLUMN created_at SET NOT NULL,
    ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP,
    ALTER COLUMN updated_at SET NOT NULL;
CREATE UNIQUE INDEX unit_of_measures_name_key ON unit_of_measures (lower(btrim(name)));

-- The original text columns stay in legacy_condoms.
ALTER TABLE condoms
    DROP COLUMN category,
    DROP COLUMN brand,
    DROP COLUMN type,
    DROP COLUMN unit_of_measure_id,
    DROP COLUMN number_of_condoms_per_unit,
    ADD COLUMN category varchar(10),
    ADD COLUMN type varchar(20),
    ADD COLUMN brand_id uuid REFERENCES brands(id),
    ADD COLUMN unit_id uuid REFERENCES unit_of_measures(id),
    ADD COLUMN pieces_per_unit integer,
    -- NULL only until import_legacy_condoms() converts the row below.
    ADD COLUMN active boolean,
    ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP,
    ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX condoms_brand_id_idx ON condoms (brand_id);
CREATE INDEX condoms_unit_id_idx ON condoms (unit_id);

CREATE FUNCTION import_legacy_condoms() RETURNS void
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
    INSERT INTO brands (name, created_at, updated_at)
    SELECT min(btrim(brand)), coalesce(min(created_at), CURRENT_TIMESTAMP), coalesce(min(created_at), CURRENT_TIMESTAMP)
    FROM legacy_condoms
    WHERE btrim(coalesce(brand, '')) <> ''
    GROUP BY lower(btrim(brand))
    ON CONFLICT ((lower(name))) DO NOTHING;

    INSERT INTO condoms (id, legacy_id, category, type, brand_id, unit_id, pieces_per_unit, active, created_at, updated_at)
    SELECT l.id, l.legacy_id, src.category, src.type, b.id, u.id, src.pieces,
        src.category IS NOT NULL AND src.type IS NOT NULL AND b.id IS NOT NULL,
        coalesce(l.created_at, CURRENT_TIMESTAMP), coalesce(l.updated_at, l.created_at, CURRENT_TIMESTAMP)
    FROM legacy_condoms l
    CROSS JOIN LATERAL (SELECT
        CASE lower(btrim(l.category)) WHEN 'male' THEN 'male' WHEN 'female' THEN 'female' END AS category,
        -- The legacy type held the distribution channel.
        CASE regexp_replace(lower(btrim(l.type)), '[\s_-]+', ' ', 'g')
            WHEN 'free' THEN 'free'
            WHEN 'public' THEN 'free'
            WHEN 'commercial' THEN 'commercial'
            WHEN 'socially marketed' THEN 'socially_marketed'
            WHEN 'social marketing' THEN 'socially_marketed'
        END AS type,
        CASE WHEN btrim(l.number_of_condoms_per_unit) ~ '^[0-9]{1,6}$' THEN
            CASE WHEN btrim(l.number_of_condoms_per_unit)::integer BETWEEN 1 AND 100000
                THEN btrim(l.number_of_condoms_per_unit)::integer END
        END AS pieces
    ) src
    LEFT JOIN brands b ON lower(b.name) = lower(btrim(l.brand))
    LEFT JOIN unit_of_measures u ON u.legacy_id = btrim(l.unit_of_measure_id)
    WHERE NOT EXISTS (SELECT 1 FROM condoms c
                      WHERE (c.id = l.id OR c.legacy_id = l.legacy_id) AND c.active IS NOT NULL)
    ON CONFLICT (id) DO UPDATE SET
        legacy_id = EXCLUDED.legacy_id, category = EXCLUDED.category, type = EXCLUDED.type,
        brand_id = EXCLUDED.brand_id, unit_id = EXCLUDED.unit_id, pieces_per_unit = EXCLUDED.pieces_per_unit,
        active = EXCLUDED.active, created_at = EXCLUDED.created_at, updated_at = EXCLUDED.updated_at;
END
$$;

SELECT import_legacy_condoms();

ALTER TABLE condoms
    ALTER COLUMN active SET NOT NULL,
    ALTER COLUMN active SET DEFAULT true,
    ALTER COLUMN created_at SET NOT NULL,
    ALTER COLUMN updated_at SET NOT NULL,
    ADD CONSTRAINT condoms_category_check CHECK (category IN ('male', 'female')),
    ADD CONSTRAINT condoms_type_check CHECK (type IN ('free', 'socially_marketed', 'commercial')),
    ADD CONSTRAINT condoms_pieces_per_unit_check CHECK (pieces_per_unit BETWEEN 1 AND 100000),
    -- Only converted legacy rows may be incomplete.
    ADD CONSTRAINT condoms_complete_check CHECK (legacy_id IS NOT NULL OR (
        category IS NOT NULL AND type IS NOT NULL AND brand_id IS NOT NULL
        AND unit_id IS NOT NULL AND pieces_per_unit IS NOT NULL));

INSERT INTO permissions (name, description) VALUES
    ('catalogue:manage', 'Create, edit, activate, deactivate and delete condom products, brands and units of measure');

INSERT INTO role_permission (role_id, permission_id)
SELECT roles.id, permissions.id FROM roles CROSS JOIN permissions
WHERE roles.name IN ('admin', 'moh') AND permissions.name = 'catalogue:manage';

COMMIT;
