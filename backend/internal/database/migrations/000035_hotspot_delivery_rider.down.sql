-- Deliveries keep everything but the delivery agent named for them. orders:deliver goes again,
-- as after migration 32, and its role grants with it.
BEGIN;

DELETE FROM role_permission
WHERE permission_id IN (SELECT id FROM permissions WHERE name = 'orders:deliver');
DELETE FROM permissions WHERE name = 'orders:deliver';

DROP INDEX hotspot_deliveries_rider_idx;
ALTER TABLE hotspot_deliveries DROP COLUMN rider_id;

COMMIT;
