BEGIN;

-- Store totals in order_store_stock are kept; batch, shipment and exception detail is dropped.
ALTER TABLE inventory_movements DROP COLUMN stock_batch_id;
DROP TABLE expiry_exceptions, shipment_batches, stock_batches;

COMMIT;
