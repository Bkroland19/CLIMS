BEGIN;

LOCK TABLE hot_spots, hot_spot_events IN ACCESS EXCLUSIVE MODE;

-- Hotspots created or changed through the workflow exist only in the new shape.
DO $$
BEGIN
    IF EXISTS (SELECT FROM hot_spot_events) OR EXISTS (SELECT FROM hot_spots WHERE legacy_id IS NULL) THEN
        RAISE EXCEPTION 'Export and clear hotspot workflow data before rolling back';
    END IF;
END;
$$;

DELETE FROM permissions WHERE name IN ('hotspots:read', 'hotspots:submit', 'hotspots:verify');

DROP VIEW hot_spot_cleanup;
DROP FUNCTION import_legacy_hot_spots();
DROP TABLE hot_spot_events, hot_spot_comments, hot_spot_user, contact_persons;

-- Restore the legacy columns from the archive. Geography, district stores and
-- DCFP store assignments are kept because the orders workflow uses them.
ALTER TABLE hot_spots
    DROP CONSTRAINT hot_spots_subcounty_fkey, DROP CONSTRAINT hot_spots_subcounty_district_check,
    DROP CONSTRAINT hot_spots_status_check,
    DROP COLUMN name, DROP COLUMN type, DROP COLUMN village, DROP COLUMN district_id,
    DROP COLUMN subcounty_id, DROP COLUMN entered_by_id, DROP COLUMN latitude, DROP COLUMN longitude,
    DROP COLUMN has_condom_dispenser, DROP COLUMN dispenser_condition, DROP COLUMN status,
    ADD COLUMN mapped_on varchar(15), ADD COLUMN mapped_by varchar(15), ADD COLUMN type varchar(8),
    ADD COLUMN name varchar(40), ADD COLUMN district varchar(20), ADD COLUMN division varchar(20),
    ADD COLUMN village varchar(20), ADD COLUMN contact_person_id varchar(15),
    ADD COLUMN contact_person_name varchar(40), ADD COLUMN contact_person_telephone varchar(15),
    ADD COLUMN status varchar(20), ADD COLUMN has_condom_dispenser varchar(3),
    ADD COLUMN dispenser_condition varchar(60), ADD COLUMN comment varchar(100),
    ADD COLUMN latitude varchar(50), ADD COLUMN longtitude varchar(50), ADD COLUMN entered_by varchar(10),
    ADD COLUMN entry_date varchar(20), ADD COLUMN last_modified varchar(20), ADD COLUMN modified_by varchar(10),
    ALTER COLUMN created_at DROP NOT NULL, ALTER COLUMN created_at DROP DEFAULT,
    ALTER COLUMN updated_at DROP NOT NULL, ALTER COLUMN updated_at DROP DEFAULT;

UPDATE hot_spots h SET
    mapped_on = l.mapped_on, mapped_by = l.mapped_by, type = l.type, name = l.name,
    district = l.district, division = l.division, village = l.village,
    contact_person_id = l.contact_person_id, contact_person_name = l.contact_person_name,
    contact_person_telephone = l.contact_person_telephone, status = l.status,
    has_condom_dispenser = l.has_condom_dispenser, dispenser_condition = l.dispenser_condition,
    comment = l.comment, latitude = l.latitude, longtitude = l.longtitude, entered_by = l.entered_by,
    entry_date = l.entry_date, last_modified = l.last_modified, modified_by = l.modified_by
FROM legacy_hot_spots l WHERE l.id = h.id;

ALTER TABLE hot_spots ALTER COLUMN hid SET NOT NULL;

DROP TABLE legacy_hot_spots, subcounties;
DROP FUNCTION hot_spot_subcounty_base(text);
DROP FUNCTION hot_spot_label(text);

COMMIT;
