-- Product types become managed catalogue records, like brands and units of
-- measure, instead of a fixed list in a CHECK constraint. The three
-- distribution channels from the national condom distribution guidelines are
-- seeded, and every product keeps the type it had.
--
-- The national warehouses (NMS and JMS) maintain the catalogue, so they are
-- granted catalogue:manage alongside admin. Administrators change who holds it
-- under Users & access, like any other permission.
BEGIN;
SET LOCAL standard_conforming_strings = on;

CREATE TABLE product_types (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name varchar(40) NOT NULL CHECK (name = btrim(name) AND name <> ''),
    note varchar(120),
    active boolean NOT NULL DEFAULT true,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- Type names are unique regardless of case, as brand and unit names are.
CREATE UNIQUE INDEX product_types_name_key ON product_types (lower(name));

INSERT INTO product_types (name, note) VALUES
    ('Free', 'Public sector, free to the user'),
    ('Socially marketed', 'Subsidised and sold through social marketing'),
    ('Commercial', 'Sold at full price by the private sector');

ALTER TABLE condoms ADD COLUMN type_id uuid REFERENCES product_types(id);
CREATE INDEX condoms_type_id_idx ON condoms (type_id);

UPDATE condoms c SET type_id = t.id
FROM product_types t
WHERE t.name = CASE c.type WHEN 'free' THEN 'Free' WHEN 'socially_marketed' THEN 'Socially marketed'
    WHEN 'commercial' THEN 'Commercial' END;

ALTER TABLE condoms
    DROP CONSTRAINT condoms_complete_check,
    DROP CONSTRAINT condoms_type_check,
    DROP COLUMN type,
    -- Only converted legacy rows may be incomplete.
    ADD CONSTRAINT condoms_complete_check CHECK (legacy_id IS NOT NULL OR (
        category IS NOT NULL AND type_id IS NOT NULL AND brand_id IS NOT NULL
        AND unit_id IS NOT NULL AND pieces_per_unit IS NOT NULL));

-- Same conversion as migration 18, now naming a product_types row. A recognised
-- legacy type whose row was renamed or deleted since is added back.
CREATE OR REPLACE FUNCTION import_legacy_condoms() RETURNS void
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
    INSERT INTO brands (name, created_at, updated_at)
    SELECT min(btrim(brand)), coalesce(min(created_at), CURRENT_TIMESTAMP), coalesce(min(created_at), CURRENT_TIMESTAMP)
    FROM legacy_condoms
    WHERE btrim(coalesce(brand, '')) <> ''
    GROUP BY lower(btrim(brand))
    ON CONFLICT ((lower(name))) DO NOTHING;

    CREATE TEMP TABLE legacy_condom_values ON COMMIT DROP AS
    SELECT l.id, l.legacy_id, l.created_at, l.updated_at, l.brand, l.unit_of_measure_id,
        CASE lower(btrim(l.category)) WHEN 'male' THEN 'male' WHEN 'female' THEN 'female' END AS category,
        -- The legacy type held the distribution channel.
        CASE regexp_replace(lower(btrim(l.type)), '[\s_-]+', ' ', 'g')
            WHEN 'free' THEN 'Free'
            WHEN 'public' THEN 'Free'
            WHEN 'commercial' THEN 'Commercial'
            WHEN 'socially marketed' THEN 'Socially marketed'
            WHEN 'social marketing' THEN 'Socially marketed'
        END AS type_name,
        CASE WHEN btrim(l.number_of_condoms_per_unit) ~ '^[0-9]{1,6}$' THEN
            CASE WHEN btrim(l.number_of_condoms_per_unit)::integer BETWEEN 1 AND 100000
                THEN btrim(l.number_of_condoms_per_unit)::integer END
        END AS pieces
    FROM legacy_condoms l;

    INSERT INTO product_types (name)
    SELECT DISTINCT type_name FROM legacy_condom_values WHERE type_name IS NOT NULL
    ON CONFLICT ((lower(name))) DO NOTHING;

    INSERT INTO condoms (id, legacy_id, category, type_id, brand_id, unit_id, pieces_per_unit, active, created_at, updated_at)
    SELECT l.id, l.legacy_id, l.category, t.id, b.id, u.id, l.pieces,
        l.category IS NOT NULL AND t.id IS NOT NULL AND b.id IS NOT NULL,
        coalesce(l.created_at, CURRENT_TIMESTAMP), coalesce(l.updated_at, l.created_at, CURRENT_TIMESTAMP)
    FROM legacy_condom_values l
    LEFT JOIN product_types t ON lower(t.name) = lower(l.type_name)
    LEFT JOIN brands b ON lower(b.name) = lower(btrim(l.brand))
    LEFT JOIN unit_of_measures u ON u.legacy_id = btrim(l.unit_of_measure_id)
    WHERE NOT EXISTS (SELECT 1 FROM condoms c
                      WHERE (c.id = l.id OR c.legacy_id = l.legacy_id) AND c.active IS NOT NULL)
    ON CONFLICT (id) DO UPDATE SET
        legacy_id = EXCLUDED.legacy_id, category = EXCLUDED.category, type_id = EXCLUDED.type_id,
        brand_id = EXCLUDED.brand_id, unit_id = EXCLUDED.unit_id, pieces_per_unit = EXCLUDED.pieces_per_unit,
        active = EXCLUDED.active, created_at = EXCLUDED.created_at, updated_at = EXCLUDED.updated_at;

    DROP TABLE legacy_condom_values;
END
$$;

UPDATE permissions
SET description = 'Create, edit, activate, deactivate and delete condom products, product types, brands and units of measure'
WHERE name = 'catalogue:manage';

INSERT INTO role_permission (role_id, permission_id)
SELECT roles.id, permissions.id FROM roles CROSS JOIN permissions
WHERE roles.name IN ('nms', 'jms') AND permissions.name = 'catalogue:manage'
ON CONFLICT DO NOTHING;

COMMIT;
