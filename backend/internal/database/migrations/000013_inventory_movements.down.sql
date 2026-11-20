BEGIN;

-- Stock balances in order_store_stock are kept; only the movement history is dropped.
DELETE FROM permissions WHERE name IN ('inventory:read', 'inventory:manage');
DROP TABLE inventory_movements;

COMMIT;
