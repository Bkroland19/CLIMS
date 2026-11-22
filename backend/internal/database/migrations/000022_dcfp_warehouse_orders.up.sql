BEGIN;

-- A hotspot stockout is no longer an order. It is a report that notifies the DCFPs of the hotspot's
-- district, who then order stock from NMS or JMS themselves. The report is kept so a retried send
-- notifies nobody twice, and so it is not lost when the district has no DCFP yet.
CREATE TABLE stockout_reports (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    hot_spot_id uuid NOT NULL REFERENCES hot_spots(id),
    condom_id uuid NOT NULL REFERENCES condoms(id),
    -- The district store the report went to, fixed when it was sent.
    district_store_id uuid NOT NULL REFERENCES stores(id),
    reported_by_id uuid NOT NULL REFERENCES users(id),
    comment text CHECK (comment IS NULL OR (comment <> '' AND length(comment) <= 4000)),
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX stockout_reports_store_idx ON stockout_reports (district_store_id, created_at DESC, id DESC);
CREATE INDEX stockout_reports_hot_spot_idx ON stockout_reports (hot_spot_id, created_at DESC, id DESC);

-- A DCFP now orders from a warehouse directly, without a parent alert. The workflow statuses used to
-- require a hotspot or a parent order; they now apply to any order outside the generic
-- pending/fulfilled lifecycle. Alert orders raised before this migration stay as history.
ALTER TABLE orders DROP CONSTRAINT order_workflow_state,
    ADD CONSTRAINT order_workflow_state CHECK (
        (order_status IN ('pending', 'fulfilled') AND hot_spot_id IS NULL AND parent_order_id IS NULL
         OR order_status IN ('queued', 'reviewed', 'on_hold', 'confirmed', 'dispatched', 'received', 'delivered'))
        AND ((quantity_issued IS NOT NULL AND handled_by_id IS NOT NULL
              AND order_status IN ('fulfilled', 'dispatched', 'received', 'delivered'))
             OR (quantity_issued IS NULL AND handled_by_id IS NULL
                 AND order_status IN ('pending', 'queued', 'reviewed', 'on_hold', 'confirmed'))));

UPDATE permissions SET description = 'Order stock from a national warehouse (NMS or JMS) for the assigned district store'
WHERE name = 'orders:replenish';
UPDATE permissions SET description = 'Report stockouts for an assigned hotspot to its district''s DCFPs'
WHERE name = 'orders:stockout';

COMMIT;
