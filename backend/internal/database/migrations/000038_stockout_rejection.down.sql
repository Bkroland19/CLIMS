-- The DCFP keeps the grants migration 38 added: seeds never take a grant away, and an administrator
-- may have granted them before this migration ran.
BEGIN;

DO $$
BEGIN
    IF EXISTS (SELECT FROM stockout_reports WHERE rejected_at IS NOT NULL) THEN
        RAISE EXCEPTION 'Rejected stockout requests cannot be represented before migration 38; resolve them before rolling back';
    END IF;
END;
$$;

UPDATE permissions
SET description = 'Record deliveries from the assigned district store to hotspots against stockout notifications'
WHERE name = 'orders:supply_hotspots';

ALTER TABLE stockout_report_events
    DROP CONSTRAINT stockout_report_events_action_check,
    ADD CONSTRAINT stockout_report_events_action_check
        CHECK (action IN ('raised', 'repeated', 'selection_changed', 'delivered', 'acknowledged'));

DROP INDEX stockout_reports_open_idx;
CREATE INDEX stockout_reports_open_idx ON stockout_reports (hot_spot_id) WHERE fulfilled_at IS NULL;

ALTER TABLE stockout_reports
    DROP CONSTRAINT stockout_reports_rejection_check,
    DROP COLUMN rejection_reason,
    DROP COLUMN rejected_by_id,
    DROP COLUMN rejected_at;

COMMIT;
