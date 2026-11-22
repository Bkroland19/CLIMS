-- Batches and expiry (reporting requirements v0.2, RF10, RF16).
--
-- A store's stock of a product in a unit is held in batches, each with an optional batch number and
-- expiry date. order_store_stock keeps the store total; the batches add up to it. Stock leaves a store
-- first-expiry-first-out, expired stock never leaves, and a batch with under one calendar month left
-- leaves only with a documented exception. The six and three month dispatch targets are reported,
-- not enforced, until the programme approves them.
BEGIN;

CREATE TABLE stock_batches (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id uuid NOT NULL,
    condom_id uuid NOT NULL,
    unit_of_measure_id uuid NOT NULL,
    batch_number varchar(60) CHECK (batch_number IS NULL OR (batch_number = btrim(batch_number) AND batch_number <> '')),
    -- NULL is unknown expiry, which needs review before it counts as usable.
    expiry_date date,
    on_hand bigint NOT NULL DEFAULT 0 CHECK (on_hand >= 0),
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (store_id, condom_id, unit_of_measure_id)
        REFERENCES order_store_stock (store_id, condom_id, unit_of_measure_id)
);

CREATE UNIQUE INDEX stock_batches_key ON stock_batches
    (store_id, condom_id, unit_of_measure_id, coalesce(batch_number, ''), coalesce(expiry_date, 'infinity'::date));
CREATE INDEX stock_batches_fefo ON stock_batches (store_id, condom_id, unit_of_measure_id, expiry_date) WHERE on_hand > 0;

-- Existing balances have no batch details: each becomes one unknown-expiry batch.
INSERT INTO stock_batches (store_id, condom_id, unit_of_measure_id, on_hand, created_at)
SELECT store_id, condom_id, unit_of_measure_id, on_hand, created_at FROM order_store_stock WHERE on_hand > 0;

-- Receipts and adjustments name the batch they changed.
ALTER TABLE inventory_movements ADD COLUMN stock_batch_id uuid REFERENCES stock_batches(id);

-- What left a store, per batch: a warehouse shipment (order) or a delivery line to a hotspot.
CREATE TABLE shipment_batches (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid REFERENCES orders(id),
    hotspot_delivery_line_id uuid REFERENCES hotspot_delivery_lines(id),
    batch_number varchar(60),
    expiry_date date,
    quantity integer NOT NULL CHECK (quantity > 0),
    -- Calendar days of shelf life left on the dispatch date, for the six and three month targets.
    days_remaining integer,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK ((order_id IS NULL) <> (hotspot_delivery_line_id IS NULL))
);

CREATE INDEX shipment_batches_order_idx ON shipment_batches (order_id) WHERE order_id IS NOT NULL;
CREATE INDEX shipment_batches_line_idx ON shipment_batches (hotspot_delivery_line_id) WHERE hotspot_delivery_line_id IS NOT NULL;

-- A batch with under one month left that left a store, with who authorised it, why, and the rule used.
CREATE TABLE expiry_exceptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    stock_batch_id uuid NOT NULL REFERENCES stock_batches(id),
    order_id uuid REFERENCES orders(id),
    hotspot_delivery_id uuid REFERENCES hotspot_deliveries(id),
    authorized_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
    reason text NOT NULL CHECK (reason <> '' AND length(reason) <= 1000),
    quantity integer NOT NULL CHECK (quantity > 0),
    expiry_date date NOT NULL,
    days_remaining integer NOT NULL,
    rule_version text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK ((order_id IS NULL) <> (hotspot_delivery_id IS NULL))
);

CREATE INDEX expiry_exceptions_created_idx ON expiry_exceptions (created_at DESC);

COMMIT;
