BEGIN;

-- Every change to a store's on-hand stock, so stock can be reported over time and traced to its cause.
-- order_store_stock stays the current balance; this ledger is append-only.
CREATE TABLE inventory_movements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id uuid NOT NULL REFERENCES stores(id),
    condom_id uuid NOT NULL REFERENCES condoms(id),
    unit_of_measure_id uuid NOT NULL REFERENCES unit_of_measures(id),
    reason text NOT NULL CHECK (reason IN ('opening', 'receipt', 'adjustment', 'dispatch', 'order_receipt')),
    quantity bigint NOT NULL CHECK (quantity <> 0),
    on_hand_after bigint NOT NULL CHECK (on_hand_after >= 0),
    order_id uuid REFERENCES orders(id),
    -- NULL for system entries such as opening balances.
    actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
    note text,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK ((reason IN ('dispatch', 'order_receipt')) = (order_id IS NOT NULL))
);

CREATE INDEX inventory_movements_store_idx ON inventory_movements (store_id, created_at DESC, id DESC);
CREATE INDEX inventory_movements_product_idx ON inventory_movements (condom_id, created_at DESC);

-- Balances that already exist become opening movements, so the ledger adds up to on_hand.
INSERT INTO inventory_movements (store_id, condom_id, unit_of_measure_id, reason, quantity, on_hand_after, actor_id, note, created_at)
SELECT s.store_id, s.condom_id, s.unit_of_measure_id, 'opening', s.on_hand, s.on_hand,
    NULL,
    'Balance before the inventory ledger', s.created_at
FROM order_store_stock s WHERE s.on_hand > 0;

INSERT INTO permissions (name, description) VALUES
    ('inventory:read', 'View stock balances, movements and hotspot deliveries for the assigned store or hotspot'),
    ('inventory:manage', 'Record stock received and stock adjustments at the assigned store');

INSERT INTO role_permission (role_id, permission_id)
SELECT roles.id, permissions.id FROM roles CROSS JOIN permissions
WHERE roles.name = 'admin' AND permissions.name IN ('inventory:read', 'inventory:manage');

COMMIT;
