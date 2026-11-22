BEGIN;

-- Requests still waiting for the warehouse to choose a product cannot be represented without one.
DELETE FROM order_events WHERE order_id IN (SELECT id FROM orders WHERE condom_id IS NULL);
DELETE FROM orders WHERE condom_id IS NULL;
ALTER TABLE orders DROP CONSTRAINT orders_product_or_category;
ALTER TABLE orders ALTER COLUMN condom_id SET NOT NULL;
ALTER TABLE orders DROP COLUMN condom_category;

COMMIT;
