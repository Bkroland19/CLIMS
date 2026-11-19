BEGIN;

LOCK TABLE orders, stores, districts, regions IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
    IF EXISTS (SELECT FROM orders) OR EXISTS (SELECT FROM districts)
       OR EXISTS (SELECT FROM regions) OR EXISTS (SELECT FROM stores WHERE code <> 'jms')
       OR EXISTS (SELECT FROM users JOIN stores ON users.store_id = stores.id) THEN
        RAISE EXCEPTION 'Export and clear orders, store assignments and geography before rolling back';
    END IF;
END;
$$;

DELETE FROM permissions WHERE name IN ('orders:read', 'orders:create', 'orders:fulfill', 'orders:all_stores');
DROP TABLE orders, stores, districts, regions;
ALTER TABLE legacy_orders RENAME TO orders;

COMMIT;
