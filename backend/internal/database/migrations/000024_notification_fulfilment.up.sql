-- Notification fulfilment (reporting requirements v0.2, RF02-RF04).
--
-- A hotspot stockout notification names Male, Female or Both and no quantity. The district records
-- deliveries against it as product lines in pieces, and the hotspot manager acknowledges the pieces
-- actually received per line. A notification is fulfilled once every selected type has a positive
-- acknowledgement; dispatch or delivery entry by anyone else does not complete it.
BEGIN;

ALTER TABLE stockout_reports
    ADD COLUMN selection varchar(6),
    ALTER COLUMN condom_id DROP NOT NULL,
    -- Messages repeated against the same open notification are counted here, not as new notifications.
    ADD COLUMN repeat_count integer NOT NULL DEFAULT 0 CHECK (repeat_count >= 0),
    ADD COLUMN last_reported_at timestamptz,
    -- Set when the last acknowledgement needed for every selected type is recorded.
    ADD COLUMN fulfilled_at timestamptz;

-- Earlier reports named one product; its category is the selection. A product without a category
-- is treated as Male, the only type ordered before categories were recorded.
UPDATE stockout_reports r SET selection = CASE (SELECT c.category FROM condoms c WHERE c.id = r.condom_id)
        WHEN 'female' THEN 'female' ELSE 'male' END,
    last_reported_at = r.created_at;

ALTER TABLE stockout_reports
    ALTER COLUMN selection SET NOT NULL,
    ADD CONSTRAINT stockout_reports_selection_check CHECK (selection IN ('male', 'female', 'both')),
    ALTER COLUMN last_reported_at SET NOT NULL,
    ALTER COLUMN last_reported_at SET DEFAULT CURRENT_TIMESTAMP,
    ADD CONSTRAINT stockout_reports_fulfilled_check CHECK (fulfilled_at IS NULL OR fulfilled_at >= created_at);

CREATE INDEX stockout_reports_open_idx ON stockout_reports (hot_spot_id) WHERE fulfilled_at IS NULL;
CREATE INDEX stockout_reports_created_idx ON stockout_reports (created_at);

-- Each notification's history: raised, repeated, selection changed, delivered, acknowledged.
CREATE TABLE stockout_report_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id uuid NOT NULL REFERENCES stockout_reports(id),
    actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
    action text NOT NULL CHECK (action IN ('raised', 'repeated', 'selection_changed', 'delivered', 'acknowledged')),
    -- The notification's selection after the event.
    selection varchar(6) NOT NULL CHECK (selection IN ('male', 'female', 'both')),
    data jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX stockout_report_events_report_idx ON stockout_report_events (report_id, created_at, id);

INSERT INTO stockout_report_events (report_id, actor_id, action, selection, created_at)
SELECT id, reported_by_id, 'raised', selection, created_at FROM stockout_reports;

CREATE TABLE hotspot_deliveries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    stockout_report_id uuid NOT NULL REFERENCES stockout_reports(id),
    district_store_id uuid NOT NULL REFERENCES stores(id),
    delivered_by_id uuid NOT NULL REFERENCES users(id),
    note text CHECK (note IS NULL OR (note <> '' AND length(note) <= 4000)),
    -- Chosen by the client so a retried send records the delivery once.
    client_reference varchar(100),
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (stockout_report_id, client_reference)
);

CREATE INDEX hotspot_deliveries_report_idx ON hotspot_deliveries (stockout_report_id, created_at);

CREATE TABLE hotspot_delivery_lines (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    delivery_id uuid NOT NULL REFERENCES hotspot_deliveries(id),
    category varchar(6) NOT NULL CHECK (category IN ('male', 'female')),
    condom_id uuid NOT NULL REFERENCES condoms(id),
    unit_of_measure_id uuid NOT NULL REFERENCES unit_of_measures(id),
    quantity integer NOT NULL CHECK (quantity > 0),
    pieces integer NOT NULL CHECK (pieces > 0),
    -- The manager's count of pieces actually received; zero means nothing arrived.
    acknowledged_pieces integer CHECK (acknowledged_pieces >= 0),
    acknowledged_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
    acknowledged_at timestamptz,
    CHECK ((acknowledged_pieces IS NULL) = (acknowledged_at IS NULL))
);

CREATE INDEX hotspot_delivery_lines_delivery_idx ON hotspot_delivery_lines (delivery_id);

-- Deliveries to hotspots leave the district store through the inventory ledger.
ALTER TABLE inventory_movements
    ADD COLUMN hotspot_delivery_id uuid REFERENCES hotspot_deliveries(id),
    DROP CONSTRAINT inventory_movements_reason_check,
    ADD CONSTRAINT inventory_movements_reason_check CHECK (reason IN
        ('opening', 'receipt', 'adjustment', 'dispatch', 'order_receipt', 'hotspot_delivery')),
    ADD CONSTRAINT inventory_movements_hotspot_delivery_check
        CHECK ((reason = 'hotspot_delivery') = (hotspot_delivery_id IS NOT NULL));

INSERT INTO permissions (name, description) VALUES
    ('orders:supply_hotspots', 'Record deliveries from the assigned district store to hotspots against stockout notifications'),
    ('reports:read', 'View reports for the assigned store, district or hotspot');

-- Like every other grant, DCFPs, managers and reporting roles receive these through the RBAC API.
INSERT INTO role_permission (role_id, permission_id)
SELECT roles.id, permissions.id FROM roles CROSS JOIN permissions
WHERE roles.name = 'admin' AND permissions.name IN ('orders:supply_hotspots', 'reports:read');

COMMIT;
