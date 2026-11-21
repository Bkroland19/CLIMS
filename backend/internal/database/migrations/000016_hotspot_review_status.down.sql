BEGIN;

LOCK TABLE hot_spots, hot_spot_events, hot_spot_comments IN ACCESS EXCLUSIVE MODE;

-- Hotspots created or changed through this workflow exist only in the new shape.
DO $$
DECLARE
    archived timestamptz := (SELECT max(archived_at) FROM legacy_hot_spots);
BEGIN
    IF EXISTS (SELECT FROM hot_spots p WHERE NOT EXISTS (SELECT FROM legacy_hot_spots l WHERE l.id = p.id))
       OR EXISTS (SELECT FROM hot_spot_events WHERE created_at > archived)
       OR EXISTS (SELECT FROM hot_spot_comments WHERE created_at > archived) THEN
        RAISE EXCEPTION 'Export and clear hotspot workflow data before rolling back';
    END IF;
END;
$$;

UPDATE permissions SET description = 'Verify and activate submitted hotspots in the district of your assigned store'
WHERE name = 'hotspots:activate';

DROP VIEW hot_spot_cleanup;
DROP FUNCTION import_legacy_hot_spots();
DROP INDEX hot_spot_events_hot_spot_idx;
DROP TABLE hot_spot_comments, contact_persons;

-- Restore the archived columns. Geography, district stores and DCFP store
-- assignments are kept because the orders workflow uses them.
ALTER TABLE hot_spots
    DROP CONSTRAINT hot_spots_status_consistent, DROP CONSTRAINT hot_spots_review_status_check,
    DROP CONSTRAINT hot_spots_status_check, DROP CONSTRAINT hot_spots_subcounty_fkey,
    DROP CONSTRAINT hot_spots_subcounty_district_check, DROP CONSTRAINT hot_spots_submitted_by_id_fkey,
    DROP COLUMN name, DROP COLUMN type, DROP COLUMN village, DROP COLUMN subcounty_id,
    DROP COLUMN latitude, DROP COLUMN longitude, DROP COLUMN has_condom_dispenser,
    DROP COLUMN dispenser_condition, DROP COLUMN status, DROP COLUMN review_status,
    ADD COLUMN mapped_on varchar(15), ADD COLUMN mapped_by varchar(15), ADD COLUMN type varchar(40),
    ADD COLUMN name varchar(40), ADD COLUMN district varchar(20), ADD COLUMN division varchar(20),
    ADD COLUMN village varchar(20), ADD COLUMN contact_person_id varchar(15),
    ADD COLUMN contact_person_name varchar(40), ADD COLUMN contact_person_telephone varchar(15),
    ADD COLUMN status varchar(20), ADD COLUMN has_condom_dispenser varchar(3),
    ADD COLUMN dispenser_condition varchar(60), ADD COLUMN comment varchar(100),
    ADD COLUMN latitude varchar(50), ADD COLUMN longtitude varchar(50), ADD COLUMN entered_by varchar(10),
    ADD COLUMN entry_date varchar(20), ADD COLUMN last_modified varchar(20), ADD COLUMN modified_by varchar(10),
    ADD COLUMN rejection_reason text,
    ALTER COLUMN created_at DROP NOT NULL, ALTER COLUMN created_at DROP DEFAULT,
    ALTER COLUMN updated_at DROP NOT NULL, ALTER COLUMN updated_at DROP DEFAULT;

DROP INDEX hot_spots_district_updated_idx, hot_spots_submitted_by_updated_idx;

UPDATE hot_spots h SET
    hid = l.hid, mapped_on = l.mapped_on, mapped_by = l.mapped_by, type = l.type, name = l.name,
    district = l.district, division = l.division, village = l.village,
    contact_person_id = l.contact_person_id, contact_person_name = l.contact_person_name,
    contact_person_telephone = l.contact_person_telephone, status = l.status,
    has_condom_dispenser = l.has_condom_dispenser, dispenser_condition = l.dispenser_condition,
    comment = l.comment, latitude = l.latitude, longtitude = l.longtitude, entered_by = l.entered_by,
    entry_date = l.entry_date, last_modified = l.last_modified, modified_by = l.modified_by,
    rejection_reason = l.rejection_reason, district_id = l.district_id, submitted_by_id = l.submitted_by_id,
    created_at = l.created_at, updated_at = l.updated_at
FROM legacy_hot_spots l WHERE l.id = h.id;

ALTER TABLE hot_spots
    ALTER COLUMN hid SET NOT NULL,
    ADD CONSTRAINT hot_spots_submitted_by_id_fkey FOREIGN KEY (submitted_by_id) REFERENCES users(id),
    ADD CONSTRAINT hot_spot_activation_state CHECK (submitted_by_id IS NULL
        OR (district_id IS NOT NULL AND status IN ('submitted', 'verified', 'active', 'rejected')
            AND (status = 'rejected') = (rejection_reason IS NOT NULL)));
CREATE INDEX hot_spots_district_idx ON hot_spots (district_id, created_at DESC, id DESC) WHERE district_id IS NOT NULL;
CREATE INDEX hot_spots_submitted_by_idx ON hot_spots (submitted_by_id) WHERE submitted_by_id IS NOT NULL;

DROP TABLE legacy_hot_spots, subcounties;
DROP FUNCTION hot_spot_subcounty_base(text);
DROP FUNCTION hot_spot_label(text);

COMMIT;
