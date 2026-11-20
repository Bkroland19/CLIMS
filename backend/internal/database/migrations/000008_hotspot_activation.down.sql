BEGIN;

LOCK TABLE hot_spots, hot_spot_events IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
    IF EXISTS (SELECT FROM hot_spot_events)
       OR EXISTS (SELECT FROM hot_spots WHERE submitted_by_id IS NOT NULL OR district_id IS NOT NULL) THEN
        RAISE EXCEPTION 'Export and clear the hotspot activation data before rolling back';
    END IF;
END;
$$;

DELETE FROM permissions WHERE name IN ('hotspots:read', 'hotspots:submit', 'hotspots:activate', 'hotspots:all_districts');
DROP TABLE hot_spot_events;
ALTER TABLE hot_spots DROP CONSTRAINT hot_spot_activation_state,
    DROP COLUMN district_id, DROP COLUMN submitted_by_id;

COMMIT;
