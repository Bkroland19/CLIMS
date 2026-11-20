BEGIN;

LOCK TABLE orders, order_events, order_store_stock, order_hot_spot_routes IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
    IF EXISTS (SELECT FROM orders WHERE hot_spot_id IS NOT NULL OR parent_order_id IS NOT NULL)
       OR EXISTS (SELECT FROM order_events) OR EXISTS (SELECT FROM order_store_stock)
       OR EXISTS (SELECT FROM order_hot_spot_routes) THEN
        RAISE EXCEPTION 'Export and clear the orders workflow data before rolling back';
    END IF;
END;
$$;

DELETE FROM permissions WHERE name IN ('orders:stockout', 'orders:process', 'orders:replenish', 'orders:receive', 'orders:deliver');
DROP TABLE order_events, order_store_stock, order_hot_spot_routes;
ALTER TABLE orders DROP CONSTRAINT order_workflow_destination, DROP CONSTRAINT order_workflow_state,
    DROP COLUMN hot_spot_id, DROP COLUMN parent_order_id, DROP COLUMN rider_id,
    DROP COLUMN quantity_received, DROP COLUMN discrepancy_note, DROP COLUMN delivery_note,
    ADD CHECK (ordered_for_store_id <> ordered_from_store_id),
    ADD CHECK ((order_status = 'pending' AND quantity_issued IS NULL AND handled_by_id IS NULL)
        OR (order_status = 'fulfilled' AND quantity_issued IS NOT NULL AND handled_by_id IS NOT NULL));

COMMIT;
