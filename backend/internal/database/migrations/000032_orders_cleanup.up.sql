-- The generic store-to-store requests (POST /orders, PATCH /orders/{id}/fulfill) and the orders-only
-- inbox (GET /orders/notifications) are gone: no client used them. Orders placed with a warehouse and
-- the central notification inbox replace them. Generic orders already recorded stay readable.
BEGIN;

-- Removing a permission removes its role grants with it. orders:deliver went unused with the rider
-- deliveries in migration 22.
DELETE FROM permissions WHERE name IN ('orders:create', 'orders:fulfill', 'orders:deliver');

-- These columns routed the orders-only inbox; order notifications live in the central inbox.
DROP INDEX order_events_store_idx;
DROP INDEX order_events_user_idx;
ALTER TABLE order_events DROP COLUMN notify_store_id, DROP COLUMN notify_user_id;

COMMIT;
