-- Shipments sent without a request stay as ordinary dispatched or received orders, placed by the
-- warehouse user who sent them; only the mark that nobody requested them is lost.
BEGIN;

ALTER TABLE orders
    DROP CONSTRAINT order_unrequested_shipment,
    DROP COLUMN unrequested;

COMMIT;
