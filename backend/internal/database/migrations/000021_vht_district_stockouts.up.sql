BEGIN;

-- VHTs raise stockout alerts on behalf of hotspots in the district they work in, and see that
-- district's active hotspots to choose from. "The district they work in" is their assigned store's
-- district, or else their assigned subcounty's (users.DistrictOfUser).
INSERT INTO permissions (name, description) VALUES
    ('orders:stockout_district', 'Report stockouts for active hotspots in the district you work in'),
    ('hotspots:read_district', 'View the active hotspots in the district you work in')
ON CONFLICT (name) DO NOTHING;

INSERT INTO role_permission (role_id, permission_id)
SELECT roles.id, permissions.id FROM roles CROSS JOIN permissions
WHERE roles.name = 'admin' AND permissions.name IN ('orders:stockout_district', 'hotspots:read_district')
ON CONFLICT DO NOTHING;

-- Like every other role grant, VHTs receive these through the RBAC API, not from a migration.

COMMIT;
