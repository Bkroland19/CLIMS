-- NMS and JMS may send stock to a district store before it asks for any. Such a shipment is an
-- order the warehouse creates already dispatched; the district receives it like any other. It is
-- marked so that request reports and response times leave it out: nobody requested it.
BEGIN;

ALTER TABLE orders
    ADD COLUMN unrequested boolean NOT NULL DEFAULT false,
    ADD CONSTRAINT order_unrequested_shipment CHECK (
        NOT unrequested OR hot_spot_id IS NULL AND order_status IN ('dispatched', 'received'));

COMMIT;
