BEGIN;

LOCK TABLE orders IN ACCESS EXCLUSIVE MODE;

-- A rejected order has no status before migration 31.
DO $$
BEGIN
    IF EXISTS (SELECT FROM orders WHERE order_status = 'rejected') THEN
        RAISE EXCEPTION 'Rejected orders have no status before migration 31; resolve them before rolling back';
    END IF;
END;
$$;

ALTER TABLE orders
    DROP CONSTRAINT order_rejection_reason,
    DROP CONSTRAINT order_workflow_state,
    DROP COLUMN rejection_reason,
    DROP COLUMN waybill_number,
    DROP COLUMN vehicle_registration,
    DROP COLUMN driver_name,
    DROP COLUMN driver_phone,
    ADD CONSTRAINT order_workflow_state CHECK (
        (order_status IN ('pending', 'fulfilled') AND hot_spot_id IS NULL AND parent_order_id IS NULL
         OR order_status IN ('queued', 'reviewed', 'on_hold', 'confirmed', 'dispatched', 'received', 'delivered'))
        AND ((quantity_issued IS NOT NULL AND handled_by_id IS NOT NULL
              AND order_status IN ('fulfilled', 'dispatched', 'received', 'delivered'))
             OR (quantity_issued IS NULL AND handled_by_id IS NULL
                 AND order_status IN ('pending', 'queued', 'reviewed', 'on_hold', 'confirmed'))));

DROP INDEX orders_open_replenishment_idx;
CREATE UNIQUE INDEX orders_open_replenishment_idx ON orders (parent_order_id)
    WHERE parent_order_id IS NOT NULL AND order_status <> 'received';

UPDATE permissions SET description = 'Review, check and dispatch workflow orders for the supplying store'
WHERE name = 'orders:process';

-- The role grants stay: they cannot be told apart from the same grants made by hand.

COMMIT;
