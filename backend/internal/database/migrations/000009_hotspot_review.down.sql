BEGIN;

LOCK TABLE hot_spots, hot_spot_events IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
    IF EXISTS (SELECT FROM hot_spots WHERE status = 'rejected' OR rejection_reason IS NOT NULL OR length(type) > 8)
       OR EXISTS (SELECT FROM hot_spot_events WHERE notify_user_id IS NOT NULL) THEN
        RAISE EXCEPTION 'Export and clear rejected hotspots, long hotspot types and VHT notifications before rolling back';
    END IF;
END;
$$;

DROP INDEX hot_spot_events_user_idx;
ALTER TABLE hot_spot_events DROP COLUMN notify_user_id;
ALTER TABLE hot_spots
    DROP CONSTRAINT hot_spot_activation_state,
    DROP COLUMN rejection_reason,
    ALTER COLUMN type TYPE varchar(8),
    ADD CONSTRAINT hot_spot_activation_state CHECK (submitted_by_id IS NULL
        OR (district_id IS NOT NULL AND status IN ('submitted', 'verified', 'active')));

COMMIT;
