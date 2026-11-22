BEGIN;

-- A district requests a condom category (male or female) from the warehouse; the warehouse chooses
-- the product when it reviews the request. Orders keep the category requested and get a product
-- once one is chosen.
ALTER TABLE orders ADD COLUMN condom_category varchar(6) CHECK (condom_category IN ('male', 'female'));

UPDATE orders o SET condom_category = c.category
FROM condoms c
WHERE c.id = o.condom_id AND c.category IN ('male', 'female');

ALTER TABLE orders ALTER COLUMN condom_id DROP NOT NULL;
ALTER TABLE orders ADD CONSTRAINT orders_product_or_category
    CHECK (condom_id IS NOT NULL OR condom_category IS NOT NULL);

COMMIT;
