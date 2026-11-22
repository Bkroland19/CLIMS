BEGIN;

-- Approved versions are dropped; reports remain live calculations.
DELETE FROM permissions WHERE name = 'reports:approve';
DROP TABLE report_versions;

COMMIT;
