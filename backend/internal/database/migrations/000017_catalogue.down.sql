-- Restores the legacy text columns from the current catalogue. Values the new
-- schema could not represent (blank or unknown legacy text, the legacy unit
-- reference) come back from legacy_condoms. Active flags and notes are lost.
BEGIN;

DELETE FROM permissions WHERE name = 'catalogue:manage';

ALTER TABLE condoms
    ADD COLUMN old_category varchar(20),
    ADD COLUMN brand varchar(60),
    ADD COLUMN old_type varchar(30),
    ADD COLUMN unit_of_measure_id varchar(5),
    ADD COLUMN number_of_condoms_per_unit varchar(255);

UPDATE condoms c SET
    old_category = coalesce(CASE c.category WHEN 'male' THEN 'Male' WHEN 'female' THEN 'Female' END, l.category, ''),
    brand = coalesce(b.name, l.brand, ''),
    old_type = coalesce(CASE c.type WHEN 'free' THEN 'Free' WHEN 'socially_marketed' THEN 'Socially marketed'
        WHEN 'commercial' THEN 'Commercial' END, l.type, ''),
    unit_of_measure_id = CASE WHEN c.unit_id IS NULL THEN l.unit_of_measure_id ELSE u.legacy_id END,
    number_of_condoms_per_unit = coalesce(c.pieces_per_unit::text, l.number_of_condoms_per_unit)
FROM condoms self
LEFT JOIN legacy_condoms l ON l.id = self.id
LEFT JOIN brands b ON b.id = self.brand_id
LEFT JOIN unit_of_measures u ON u.id = self.unit_id
WHERE self.id = c.id;

ALTER TABLE condoms
    DROP COLUMN category,
    DROP COLUMN type,
    DROP COLUMN brand_id,
    DROP COLUMN unit_id,
    DROP COLUMN pieces_per_unit,
    DROP COLUMN active,
    ALTER COLUMN created_at DROP NOT NULL,
    ALTER COLUMN created_at DROP DEFAULT,
    ALTER COLUMN updated_at DROP NOT NULL,
    ALTER COLUMN updated_at DROP DEFAULT,
    ALTER COLUMN old_category SET NOT NULL,
    ALTER COLUMN brand SET NOT NULL,
    ALTER COLUMN old_type SET NOT NULL;
ALTER TABLE condoms RENAME COLUMN old_category TO category;
ALTER TABLE condoms RENAME COLUMN old_type TO type;

DROP FUNCTION import_legacy_condoms();
DROP TABLE legacy_condoms;
DROP TABLE brands;

DROP INDEX unit_of_measures_name_key;
ALTER TABLE unit_of_measures
    DROP COLUMN note,
    DROP COLUMN active,
    ALTER COLUMN created_at DROP NOT NULL,
    ALTER COLUMN created_at DROP DEFAULT,
    ALTER COLUMN updated_at DROP NOT NULL,
    ALTER COLUMN updated_at DROP DEFAULT;

-- Narrow the columns back only where every value still fits.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM condoms WHERE length(brand) > 30) THEN
        ALTER TABLE condoms ALTER COLUMN brand TYPE varchar(30);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM unit_of_measures WHERE length(name) > 15) THEN
        ALTER TABLE unit_of_measures ALTER COLUMN name TYPE varchar(15);
    END IF;
END
$$;

COMMIT;
