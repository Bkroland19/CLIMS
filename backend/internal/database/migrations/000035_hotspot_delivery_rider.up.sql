-- A district may name the delivery agent (rider) who carries a delivery to the hotspot. It is
-- optional: a DCFP may deliver in person or by other means. The agent sees the deliveries named
-- for them in the field app.
BEGIN;

ALTER TABLE hotspot_deliveries ADD COLUMN rider_id uuid REFERENCES users(id);

CREATE INDEX hotspot_deliveries_rider_idx ON hotspot_deliveries (rider_id, created_at DESC)
    WHERE rider_id IS NOT NULL;

-- Migration 32 removed orders:deliver when the old rider dispatch went. It returns for this: only
-- holders may be named as a delivery's agent, and they list the deliveries named for them.
INSERT INTO permissions (name, description) VALUES
    ('orders:deliver', 'Carry hotspot deliveries named for them, and see those deliveries')
ON CONFLICT (name) DO NOTHING;

-- The delivery agent role exists for this work, so it holds the permission from the start, as
-- admin does; other roles receive it through the RBAC API.
INSERT INTO role_permission (role_id, permission_id)
SELECT roles.id, permissions.id FROM roles CROSS JOIN permissions
WHERE roles.name IN ('admin', 'delivery agent') AND permissions.name = 'orders:deliver'
ON CONFLICT DO NOTHING;

COMMIT;
