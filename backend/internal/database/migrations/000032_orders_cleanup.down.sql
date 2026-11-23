BEGIN;

-- The routing of earlier events is not recovered; the columns come back empty.
ALTER TABLE order_events ADD COLUMN notify_store_id uuid REFERENCES stores(id),
    ADD COLUMN notify_user_id uuid REFERENCES users(id);
CREATE INDEX order_events_store_idx ON order_events (notify_store_id, created_at DESC, id DESC)
    WHERE notify_store_id IS NOT NULL;
CREATE INDEX order_events_user_idx ON order_events (notify_user_id, created_at DESC, id DESC)
    WHERE notify_user_id IS NOT NULL;

-- The definitions come back granted to admin only, as they were first created; other grants are not
-- recovered.
INSERT INTO permissions (name, description) VALUES
    ('orders:create', 'Request stock for the assigned store'),
    ('orders:fulfill', 'Record quantities issued by the assigned store'),
    ('orders:deliver', 'Record delivery for orders assigned to the rider')
ON CONFLICT DO NOTHING;
INSERT INTO role_permission (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.name IN ('orders:create', 'orders:fulfill', 'orders:deliver')
WHERE r.name = 'admin'
ON CONFLICT DO NOTHING;

COMMIT;
