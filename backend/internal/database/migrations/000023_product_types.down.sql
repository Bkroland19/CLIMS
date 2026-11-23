-- Turns product types back into the fixed list of migration 18. Refuses while a
-- product that must be complete uses a type outside that list, since the old
-- schema cannot hold it. Grants of catalogue:manage to nms and jms are removed,
-- including any an administrator made since.
BEGIN;
SET LOCAL standard_conforming_strings = on;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM condoms c JOIN product_types t ON t.id = c.type_id
               WHERE c.legacy_id IS NULL AND lower(t.name) NOT IN ('free', 'socially marketed', 'commercial')) THEN
        RAISE EXCEPTION 'products use types other than Free, Socially marketed and Commercial; change them first';
    END IF;
END
$$;

DELETE FROM role_permission rp USING roles r, permissions p
WHERE rp.role_id = r.id AND rp.permission_id = p.id
    AND r.name IN ('nms', 'jms') AND p.name = 'catalogue:manage';

UPDATE permissions
SET description = 'Create, edit, activate, deactivate and delete condom products, brands and units of measure'
WHERE name = 'catalogue:manage';

ALTER TABLE condoms ADD COLUMN type varchar(20);
UPDATE condoms c SET type = CASE lower(t.name) WHEN 'free' THEN 'free'
    WHEN 'socially marketed' THEN 'socially_marketed' WHEN 'commercial' THEN 'commercial' END
FROM product_types t WHERE t.id = c.type_id;

ALTER TABLE condoms
    DROP CONSTRAINT condoms_complete_check,
    DROP COLUMN type_id,
    ADD CONSTRAINT condoms_type_check CHECK (type IN ('free', 'socially_marketed', 'commercial')),
    ADD CONSTRAINT condoms_complete_check CHECK (legacy_id IS NOT NULL OR (
        category IS NOT NULL AND type IS NOT NULL AND brand_id IS NOT NULL
        AND unit_id IS NOT NULL AND pieces_per_unit IS NOT NULL));

DROP TABLE product_types;

CREATE OR REPLACE FUNCTION import_legacy_condoms() RETURNS void
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

COMMIT;
