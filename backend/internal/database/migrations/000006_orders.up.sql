BEGIN;

CREATE TABLE regions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    uid varchar NOT NULL UNIQUE,
    name varchar NOT NULL,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE districts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    uid varchar NOT NULL UNIQUE,
    name varchar NOT NULL,
    region_id uuid NOT NULL REFERENCES regions(id),
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE stores (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code varchar NOT NULL UNIQUE,
    name varchar NOT NULL,
    store_type varchar NOT NULL,
    district_id uuid UNIQUE REFERENCES districts(id),
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK ((store_type = 'national' AND district_id IS NULL)
        OR (store_type = 'district' AND district_id IS NOT NULL))
);

INSERT INTO stores (code, name, store_type) VALUES ('jms', 'Joint Medical Store', 'national');

-- Historical orders do not identify a product. Preserve any operator data
-- as-is instead of assigning an unverified product or store.
ALTER TABLE orders RENAME TO legacy_orders;

CREATE TABLE orders (
    id uuid CONSTRAINT stock_orders_pkey PRIMARY KEY DEFAULT gen_random_uuid(),
    condom_id uuid NOT NULL REFERENCES condoms(id),
    quantity_needed integer NOT NULL CHECK (quantity_needed > 0),
    quantity_issued integer CHECK (quantity_issued BETWEEN 1 AND quantity_needed),
    order_status varchar NOT NULL DEFAULT 'pending',
    order_date date NOT NULL DEFAULT CURRENT_DATE,
    ordered_by_id uuid NOT NULL REFERENCES users(id),
    handled_by_id uuid REFERENCES users(id),
    ordered_for_store_id uuid NOT NULL REFERENCES stores(id),
    ordered_from_store_id uuid NOT NULL REFERENCES stores(id),
    unit_of_measure_id uuid NOT NULL REFERENCES unit_of_measures(id),
    comment text,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (ordered_for_store_id <> ordered_from_store_id),
    CHECK ((order_status = 'pending' AND quantity_issued IS NULL AND handled_by_id IS NULL)
        OR (order_status = 'fulfilled' AND quantity_issued IS NOT NULL AND handled_by_id IS NOT NULL))
);

CREATE INDEX orders_requesting_store_idx ON orders (ordered_for_store_id, created_at DESC, id DESC);
CREATE INDEX orders_supplying_store_idx ON orders (ordered_from_store_id, created_at DESC, id DESC);
CREATE INDEX orders_created_idx ON orders (created_at DESC, id DESC);

INSERT INTO permissions (name, description) VALUES
    ('orders:read', 'View orders involving the assigned store'),
    ('orders:create', 'Request stock for the assigned store'),
    ('orders:fulfill', 'Record quantities issued by the assigned store'),
    ('orders:all_stores', 'Use assigned orders permissions across stores');

INSERT INTO role_permission (role_id, permission_id)
SELECT roles.id, permissions.id
FROM roles CROSS JOIN permissions
WHERE roles.name = 'admin' AND permissions.name IN
    ('orders:read', 'orders:create', 'orders:fulfill', 'orders:all_stores');

COMMIT;
