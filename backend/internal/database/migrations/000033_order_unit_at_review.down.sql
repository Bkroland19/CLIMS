BEGIN;

-- Before migration 33 every order named its unit. Orders still waiting for the warehouse's review
-- have none to restore, so they must be reviewed or rejected first.
DO $$
BEGIN
    IF EXISTS (SELECT FROM orders WHERE unit_of_measure_id IS NULL AND hot_spot_id IS NULL) THEN
        RAISE EXCEPTION 'Orders placed without a unit (waiting for review, or rejected before it) cannot be expressed before migration 33';
    END IF;
END;
$$;

ALTER TABLE orders
    DROP CONSTRAINT order_quantity_specified,
    ADD CONSTRAINT order_quantity_specified CHECK (
        quantity_needed IS NOT NULL AND unit_of_measure_id IS NOT NULL
        OR hot_spot_id IS NOT NULL AND order_status IN ('queued', 'on_hold'));

COMMIT;
