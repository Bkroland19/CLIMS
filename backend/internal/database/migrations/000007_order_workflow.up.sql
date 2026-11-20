BEGIN;

CREATE TABLE order_hot_spot_routes (
    hot_spot_id uuid PRIMARY KEY REFERENCES hot_spots(id),
    store_id uuid NOT NULL REFERENCES stores(id)
);

ALTER TABLE orders DROP CONSTRAINT orders_check1, DROP CONSTRAINT orders_check2,
    ADD COLUMN hot_spot_id uuid REFERENCES hot_spots(id),
    ADD COLUMN parent_order_id uuid REFERENCES orders(id),
    ADD COLUMN rider_id uuid REFERENCES users(id),
    ADD COLUMN quantity_received integer CHECK (quantity_received >= 0),
    ADD COLUMN discrepancy_note text,
    ADD COLUMN delivery_note text,
    ADD CONSTRAINT order_workflow_destination CHECK (
        (hot_spot_id IS NOT NULL AND ordered_for_store_id = ordered_from_store_id AND parent_order_id IS NULL)
        OR (hot_spot_id IS NULL AND ordered_for_store_id <> ordered_from_store_id)),
    ADD CONSTRAINT order_workflow_state CHECK (
        ((hot_spot_id IS NULL AND parent_order_id IS NULL) AND order_status IN ('pending', 'fulfilled')
         OR (hot_spot_id IS NOT NULL OR parent_order_id IS NOT NULL)
            AND order_status IN ('queued', 'reviewed', 'on_hold', 'confirmed', 'dispatched', 'received', 'delivered'))
        AND ((quantity_issued IS NOT NULL AND handled_by_id IS NOT NULL
              AND order_status IN ('fulfilled', 'dispatched', 'received', 'delivered'))
             OR (quantity_issued IS NULL AND handled_by_id IS NULL
                 AND order_status IN ('pending', 'queued', 'reviewed', 'on_hold', 'confirmed'))));

CREATE UNIQUE INDEX orders_open_replenishment_idx ON orders(parent_order_id)
    WHERE parent_order_id IS NOT NULL AND order_status <> 'received';
CREATE INDEX orders_hot_spot_idx ON orders(hot_spot_id) WHERE hot_spot_id IS NOT NULL;
CREATE INDEX orders_rider_idx ON orders(rider_id) WHERE rider_id IS NOT NULL;

CREATE TABLE order_store_stock (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id uuid NOT NULL REFERENCES stores(id),
    condom_id uuid NOT NULL REFERENCES condoms(id),
    unit_of_measure_id uuid NOT NULL REFERENCES unit_of_measures(id),
    on_hand bigint NOT NULL CHECK (on_hand >= 0),
    reserved bigint NOT NULL DEFAULT 0 CHECK (reserved BETWEEN 0 AND on_hand),
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (store_id, condom_id, unit_of_measure_id)
);

CREATE TABLE order_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid NOT NULL REFERENCES orders(id),
    actor_id uuid NOT NULL REFERENCES users(id),
    action text NOT NULL,
    status text NOT NULL,
    notify_store_id uuid REFERENCES stores(id),
    notify_user_id uuid REFERENCES users(id),
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX order_events_order_idx ON order_events(order_id, created_at, id);
CREATE INDEX order_events_store_idx ON order_events(notify_store_id, created_at DESC, id DESC) WHERE notify_store_id IS NOT NULL;
CREATE INDEX order_events_user_idx ON order_events(notify_user_id, created_at DESC, id DESC) WHERE notify_user_id IS NOT NULL;

INSERT INTO permissions (name, description) VALUES
    ('orders:stockout', 'Report stockouts for an assigned hotspot'),
    ('orders:process', 'Review, check and dispatch workflow orders for the supplying store'),
    ('orders:replenish', 'Request warehouse stock for a held hotspot order'),
    ('orders:receive', 'Verify and record stock received by the requesting store'),
    ('orders:deliver', 'Record delivery for orders assigned to the rider');

INSERT INTO role_permission (role_id, permission_id)
SELECT roles.id, permissions.id FROM roles CROSS JOIN permissions
WHERE roles.name = 'admin' AND permissions.name IN
    ('orders:stockout', 'orders:process', 'orders:replenish', 'orders:receive', 'orders:deliver');

COMMIT;
