-- A DCFP can reject a hotspot's stockout request with a reason, as long as no stock has gone to it.
-- A rejected request is closed, like a fulfilled one, so the hotspot's next report opens a new
-- request. The hotspot is told why.
--
-- Migration 31 left orders:supply_hotspots and reports:read out of the DCFP's default grants, although
-- the DCFP is the person who sends district stock to hotspots (docs/modules/orders.md). Without them a
-- DCFP could read a request but neither send stock nor reject it. They are granted here.
BEGIN;

ALTER TABLE stockout_reports
    ADD COLUMN rejected_at timestamptz,
    ADD COLUMN rejected_by_id uuid REFERENCES users(id),
    ADD COLUMN rejection_reason text
        CHECK (rejection_reason IS NULL OR (btrim(rejection_reason) <> '' AND length(rejection_reason) <= 1000)),
    -- A rejection has a time, a reason and who made it (the user may be deleted later), and a
    -- request is either fulfilled or rejected, never both.
    ADD CONSTRAINT stockout_reports_rejection_check CHECK (
        (rejected_at IS NULL) = (rejection_reason IS NULL)
        AND (rejected_at IS NULL OR rejected_at >= created_at)
        AND (rejected_at IS NULL OR fulfilled_at IS NULL));

-- A hotspot's open request is neither fulfilled nor rejected.
DROP INDEX stockout_reports_open_idx;
CREATE INDEX stockout_reports_open_idx ON stockout_reports (hot_spot_id)
    WHERE fulfilled_at IS NULL AND rejected_at IS NULL;

ALTER TABLE stockout_report_events
    DROP CONSTRAINT stockout_report_events_action_check,
    ADD CONSTRAINT stockout_report_events_action_check
        CHECK (action IN ('raised', 'repeated', 'selection_changed', 'delivered', 'acknowledged', 'rejected'));

UPDATE permissions
SET description = 'Send stock from the assigned district store to hotspots against their stockout requests, or reject a request'
WHERE name = 'orders:supply_hotspots';

-- Default grants, which administrators can change in Users & access. Seeds only add grants and never
-- take one away. The legacy data spells the DCFP role "dfcp".
INSERT INTO role_permission (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p
    ON r.name IN ('dfcp', 'dcfp') AND p.name IN ('orders:supply_hotspots', 'reports:read')
ON CONFLICT DO NOTHING;

COMMIT;
