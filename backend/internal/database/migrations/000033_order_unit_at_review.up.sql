-- A DCFP's warehouse order names a condom category and a quantity, and no unit. The warehouse
-- chooses the product at review and the order is counted in that product's catalogue unit, so an
-- order may lack a unit until it has a product. Every other order still names its unit.
BEGIN;

ALTER TABLE orders
    DROP CONSTRAINT order_quantity_specified,
    ADD CONSTRAINT order_quantity_specified CHECK (
        quantity_needed IS NOT NULL AND (unit_of_measure_id IS NOT NULL OR condom_id IS NULL)
        OR hot_spot_id IS NOT NULL AND order_status IN ('queued', 'on_hold'));

COMMIT;
