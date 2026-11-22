BEGIN;

LOCK TABLE stockout_reports, hotspot_deliveries, inventory_movements IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
    IF EXISTS (SELECT FROM hotspot_deliveries) OR EXISTS (SELECT FROM stockout_reports WHERE condom_id IS NULL) THEN
        RAISE EXCEPTION 'Export hotspot deliveries and notifications without a product before rolling back';
    END IF;
END;
$$;

DELETE FROM permissions WHERE name IN ('orders:supply_hotspots', 'reports:read');

ALTER TABLE inventory_movements
    DROP CONSTRAINT inventory_movements_hotspot_delivery_check,
    DROP CONSTRAINT inventory_movements_reason_check,
    DROP COLUMN hotspot_delivery_id,
    ADD CONSTRAINT inventory_movements_reason_check CHECK (reason IN
        ('opening', 'receipt', 'adjustment', 'dispatch', 'order_receipt'));

DROP TABLE hotspot_delivery_lines, hotspot_deliveries, stockout_report_events;

ALTER TABLE stockout_reports
    DROP CONSTRAINT stockout_reports_fulfilled_check,
    DROP CONSTRAINT stockout_reports_selection_check,
    DROP COLUMN selection,
    DROP COLUMN repeat_count,
    DROP COLUMN last_reported_at,
    DROP COLUMN fulfilled_at,
    ALTER COLUMN condom_id SET NOT NULL;

DROP INDEX IF EXISTS stockout_reports_open_idx;
DROP INDEX IF EXISTS stockout_reports_created_idx;

COMMIT;
