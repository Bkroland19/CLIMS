BEGIN;

-- A hotspot stockout is now an alert without a quantity: the DCFP chooses the unit and quantity when
-- sending stock or requesting it from the warehouse. Open alerts (queued, or on_hold while waiting for
-- the warehouse) may therefore lack both; every other order still has them.
ALTER TABLE orders
    ALTER COLUMN quantity_needed DROP NOT NULL,
    ALTER COLUMN unit_of_measure_id DROP NOT NULL,
    ADD CONSTRAINT order_quantity_specified CHECK (
        (quantity_needed IS NOT NULL AND unit_of_measure_id IS NOT NULL)
        OR (hot_spot_id IS NOT NULL AND order_status IN ('queued', 'on_hold')));

-- Alerts left mid-way by the earlier flow return to the DCFP's queue. A confirmed alert releases the
-- stock it reserved, since the DCFP now takes stock at dispatch.
UPDATE order_store_stock s SET reserved = s.reserved - held.quantity, updated_at = CURRENT_TIMESTAMP
FROM (SELECT ordered_from_store_id, condom_id, unit_of_measure_id, sum(quantity_needed) AS quantity
      FROM orders WHERE hot_spot_id IS NOT NULL AND order_status = 'confirmed'
      GROUP BY 1, 2, 3) held
WHERE s.store_id = held.ordered_from_store_id AND s.condom_id = held.condom_id
    AND s.unit_of_measure_id = held.unit_of_measure_id;

UPDATE orders o SET order_status = 'queued', updated_at = CURRENT_TIMESTAMP
WHERE o.hot_spot_id IS NOT NULL AND (o.order_status IN ('reviewed', 'confirmed')
    OR (o.order_status = 'on_hold' AND NOT EXISTS (
        SELECT FROM orders child WHERE child.parent_order_id = o.id AND child.order_status <> 'received')));

COMMIT;
