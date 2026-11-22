BEGIN;

-- Removing the two permissions drops their grants with them.
DELETE FROM permissions WHERE name IN ('orders:stockout_district', 'hotspots:read_district');

COMMIT;
