BEGIN;

-- Legacy hotspots keep their free-text status; submitted ones follow the activation workflow.
ALTER TABLE hot_spots
    ADD COLUMN district_id uuid REFERENCES districts(id),
    ADD COLUMN submitted_by_id uuid REFERENCES users(id),
    ADD CONSTRAINT hot_spot_activation_state CHECK (submitted_by_id IS NULL
        OR (district_id IS NOT NULL AND status IN ('submitted', 'verified', 'active')));

CREATE INDEX hot_spots_district_idx ON hot_spots (district_id, created_at DESC, id DESC) WHERE district_id IS NOT NULL;
CREATE INDEX hot_spots_submitted_by_idx ON hot_spots (submitted_by_id) WHERE submitted_by_id IS NOT NULL;

CREATE TABLE hot_spot_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    hot_spot_id uuid NOT NULL REFERENCES hot_spots(id),
    actor_id uuid NOT NULL REFERENCES users(id),
    action text NOT NULL,
    status text NOT NULL,
    notify_district_id uuid REFERENCES districts(id),
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX hot_spot_events_district_idx ON hot_spot_events (notify_district_id, created_at DESC, id DESC)
    WHERE notify_district_id IS NOT NULL;

INSERT INTO permissions (name, description) VALUES
    ('hotspots:read', 'View hotspots you submitted or in the district of your assigned store'),
    ('hotspots:submit', 'Submit details of an identified hotspot for district activation'),
    ('hotspots:activate', 'Verify and activate submitted hotspots in the district of your assigned store'),
    ('hotspots:all_districts', 'Use assigned hotspot permissions across districts');

-- Other roles are granted through the RBAC API: vht gets read+submit, dfcp gets read+activate.
INSERT INTO role_permission (role_id, permission_id)
SELECT roles.id, permissions.id FROM roles CROSS JOIN permissions
WHERE roles.name = 'admin' AND permissions.name IN
    ('hotspots:read', 'hotspots:submit', 'hotspots:activate', 'hotspots:all_districts');

COMMIT;
