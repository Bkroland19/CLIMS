BEGIN;

ALTER TABLE users
    ADD COLUMN organisation_unit_id uuid REFERENCES organization_units(id),
    ADD COLUMN hot_spot_id uuid REFERENCES hot_spots(id),
    ADD COLUMN subcounty_id uuid,
    ADD COLUMN store_id uuid;

CREATE INDEX users_organisation_unit_id_idx ON users (organisation_unit_id);
CREATE INDEX users_hot_spot_id_idx ON users (hot_spot_id);

-- Resolve historical references only when they identify exactly one row.
CREATE FUNCTION resolve_legacy_user_context() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.organisation_unit_id IS NULL AND NULLIF(btrim(NEW.organization_unit_id), '') IS NOT NULL THEN
        SELECT CASE WHEN count(*) = 1 THEN (array_agg(id))[1] END
        INTO NEW.organisation_unit_id FROM public.organization_units
        WHERE uid = btrim(NEW.organization_unit_id) OR legacy_id = btrim(NEW.organization_unit_id);
    END IF;
    IF NEW.hot_spot_id IS NULL AND NULLIF(btrim(NEW.hotspot_id), '') IS NOT NULL THEN
        SELECT CASE WHEN count(*) = 1 THEN (array_agg(id))[1] END
        INTO NEW.hot_spot_id FROM public.hot_spots
        WHERE hid = btrim(NEW.hotspot_id) OR legacy_id = btrim(NEW.hotspot_id);
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER users_resolve_legacy_context
BEFORE INSERT OR UPDATE OF organization_unit_id, hotspot_id ON users
FOR EACH ROW EXECUTE FUNCTION resolve_legacy_user_context();

UPDATE users SET organization_unit_id = organization_unit_id
WHERE NULLIF(btrim(organization_unit_id), '') IS NOT NULL
   OR NULLIF(btrim(hotspot_id), '') IS NOT NULL;

COMMIT;
