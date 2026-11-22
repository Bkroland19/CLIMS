BEGIN;

-- The settings history is dropped; reports fall back to request parameters and the draft defaults.
DELETE FROM permissions WHERE name = 'reports:configure';
DROP TABLE report_response_settings;

COMMIT;
