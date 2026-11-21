BEGIN;

LOCK TABLE orders IN ACCESS EXCLUSIVE MODE;

-- The earlier constraint has no place for a warehouse order without a parent alert.
DO $$
BEGIN
    IF EXISTS (SELECT FROM orders WHERE hot_spot_id IS NULL AND parent_order_id IS NULL
               AND order_status NOT IN ('pending', 'fulfilled')) THEN
        RAISE EXCEPTION 'Resolve DCFP warehouse orders without a parent alert before rolling back';
    END IF;
END;
$$;

ALTER TABLE orders DROP CONSTRAINT order_workflow_state,
    ADD CONSTRAINT order_workflow_state CHECK (
        ((hot_spot_id IS NULL AND parent_order_id IS NULL) AND order_status IN ('pending', 'fulfilled')
         OR (hot_spot_id IS NOT NULL OR parent_order_id IS NOT NULL)
            AND order_status IN ('queued', 'reviewed', 'on_hold', 'confirmed', 'dispatched', 'received', 'delivered'))
        AND ((quantity_issued IS NOT NULL AND handled_by_id IS NOT NULL
              AND order_status IN ('fulfilled', 'dispatched', 'received', 'delivered'))
             OR (quantity_issued IS NULL AND handled_by_id IS NULL
                 AND order_status IN ('pending', 'queued', 'reviewed', 'on_hold', 'confirmed'))));

UPDATE permissions SET description = 'Request warehouse stock for a held hotspot order' WHERE name = 'orders:replenish';
UPDATE permissions SET description = 'Report stockouts for an assigned hotspot' WHERE name = 'orders:stockout';

DROP TABLE stockout_reports;

COMMIT;
