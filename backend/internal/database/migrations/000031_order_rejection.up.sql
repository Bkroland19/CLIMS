-- NMS and JMS can reject a DCFP's order with a reason, at any step before dispatch. A rejection closes
-- the order and releases what check-stock reserved; the DCFP places a new order if they still need
-- stock. Dispatch can also record the transport: waybill, vehicle and driver, each optional.
BEGIN;

LOCK TABLE orders IN ACCESS EXCLUSIVE MODE;

ALTER TABLE orders
    ADD COLUMN rejection_reason text
        CHECK (rejection_reason IS NULL OR (btrim(rejection_reason) <> '' AND length(rejection_reason) <= 4000)),
    ADD COLUMN waybill_number text
        CHECK (waybill_number IS NULL OR (btrim(waybill_number) <> '' AND length(waybill_number) <= 100)),
    ADD COLUMN vehicle_registration text
        CHECK (vehicle_registration IS NULL OR (btrim(vehicle_registration) <> '' AND length(vehicle_registration) <= 30)),
    ADD COLUMN driver_name text
        CHECK (driver_name IS NULL OR (btrim(driver_name) <> '' AND length(driver_name) <= 200)),
    ADD COLUMN driver_phone text
        CHECK (driver_phone IS NULL OR (btrim(driver_phone) <> '' AND length(driver_phone) <= 30)),
    DROP CONSTRAINT order_workflow_state,
    ADD CONSTRAINT order_workflow_state CHECK (
        (order_status IN ('pending', 'fulfilled') AND hot_spot_id IS NULL AND parent_order_id IS NULL
         OR order_status IN ('queued', 'reviewed', 'on_hold', 'confirmed', 'rejected', 'dispatched', 'received', 'delivered'))
        AND ((quantity_issued IS NOT NULL AND handled_by_id IS NOT NULL
              AND order_status IN ('fulfilled', 'dispatched', 'received', 'delivered'))
             OR (quantity_issued IS NULL AND handled_by_id IS NULL
                 AND order_status IN ('pending', 'queued', 'reviewed', 'on_hold', 'confirmed', 'rejected')))),
    -- Only a rejected order has a reason, and every rejected order has one.
    ADD CONSTRAINT order_rejection_reason CHECK ((rejection_reason IS NOT NULL) = (order_status = 'rejected'));

-- A rejected request linked to an older alert order is closed, like a received one.
DROP INDEX orders_open_replenishment_idx;
CREATE UNIQUE INDEX orders_open_replenishment_idx ON orders (parent_order_id)
    WHERE parent_order_id IS NOT NULL AND order_status NOT IN ('received', 'rejected');

UPDATE permissions SET description = 'Review, check, reject and dispatch orders placed with the assigned warehouse store'
WHERE name = 'orders:process';

-- Default grants for the warehouse flow, which administrators can change in Users & access. Seeds only
-- add grants and never take one away. The legacy data spells the DCFP role "dfcp".
INSERT INTO role_permission (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p
    ON (r.name IN ('nms', 'jms')
        AND p.name IN ('orders:read', 'orders:process', 'inventory:read', 'inventory:manage'))
    OR (r.name IN ('dfcp', 'dcfp')
        AND p.name IN ('orders:read', 'orders:replenish', 'orders:receive', 'inventory:read', 'inventory:manage'))
ON CONFLICT DO NOTHING;

COMMIT;
