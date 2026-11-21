BEGIN;

LOCK TABLE orders IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
    IF EXISTS (SELECT FROM orders WHERE quantity_needed IS NULL OR unit_of_measure_id IS NULL) THEN
        RAISE EXCEPTION 'Resolve stockout alerts without a quantity before rolling back';
    END IF;
END;
$$;

ALTER TABLE orders
    DROP CONSTRAINT order_quantity_specified,
    ALTER COLUMN quantity_needed SET NOT NULL,
    ALTER COLUMN unit_of_measure_id SET NOT NULL;

COMMIT;
