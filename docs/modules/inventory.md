# Inventory

[Module architecture](README.md)

The inventory API reports stock across the supply chain: the national warehouse, district stores and hotspots. It also records stock that arrives outside the order workflow.

| Method | Route                         | Permission         |
| ------ | ----------------------------- | ------------------ |
| GET    | `/api/v1/inventory/stock`     | `inventory:read`   |
| GET    | `/api/v1/inventory/hotspots`  | `inventory:read`   |
| GET    | `/api/v1/inventory/movements` | `inventory:read`   |
| POST   | `/api/v1/inventory/movements` | `inventory:manage` |
| GET    | `/api/v1/inventory/summary`   | `inventory:read`   |

## Reports

- **Stock** lists each store's balance per product and unit: `on_hand`, `reserved` for confirmed orders, `available` (on hand less reserved) and `incoming` (dispatched to the store by the warehouse and not yet received). Filter by `store_id`, `store_type` (`national` or `district`) or `condom_id`.
- **Hotspots** reports what each hotspot was supplied through the alert orders raised before migration 22 (see [orders](orders.md#alert-orders-raised-before-migration-22)); stockout reports are not orders and do not appear. Per product: quantity `delivered` and number of `deliveries` in the period, `last_delivered_at`, quantity `in_transit` with a rider, `open_alerts` not yet sent, `on_hold_requests` waiting for the warehouse and `last_stockout_at`. An open alert has no unit until the DCFP acts, so it is reported on a row without one, as it is in the summary. CLIMS does not record consumption at hotspots, so this is supply, not a count of stock on site. Filter by `hot_spot_id` or `condom_id`.
- **Movements** is the ledger behind the balances: every change to a store's on-hand stock, newest first, with `on_hand_after`. Reasons are `opening`, `receipt`, `adjustment`, `dispatch` and `order_receipt`; the last two are written by the [order workflow](orders.md) and link the order. Filter by `store_id`, `condom_id` or `reason`, and page with `limit` and `offset`.
- **Summary** totals each product nationally: warehouse and district stock on hand and available, stock in transit, and, from alert orders raised before migration 22, quantity delivered to hotspots in the period and open hotspot requests. Held counts include held warehouse orders.

Hotspot, movement and summary reports accept a period as `from` and `to` dates (`YYYY-MM-DD`, both days included). Hotspot deliveries are dated by the order's last update, which is the delivery.

## Recording stock

`POST /api/v1/inventory/movements` adds a ledger entry and updates the store's balance in one transaction:

- `receipt` adds a positive `quantity`, for example a supplier delivery to the warehouse or opening stock at a new district store.
- `adjustment` corrects stock after a count in either direction and requires a `note`.

Stock cannot fall below what open orders have reserved; such an adjustment returns 409. Order dispatch and receipt continue to move stock themselves and record their own entries.

## Batches and expiry

A store's stock of a product in a unit is held in batches (`stock_batches`), each with an optional `batch_number` and `expiry_date`, adding up to the store total. A receipt or positive adjustment adds to the batch it names; a negative adjustment comes out of it (409 when the batch holds less). Without batch details the stock is in the unknown-expiry batch, which reports do not count as usable until reviewed. Migration 26 put each existing balance in an unknown-expiry batch.

Stock leaves a store first expiry first out: warehouse dispatch and district deliveries to hotspots take the earliest-expiring batch first and unknown expiry last. Expired batches never leave, and a batch with under one calendar month left leaves only with an `expiry_exception_reason`, recorded with who authorised it and the rule version. What left is recorded per batch (`shipment_batches`), and a district's receipt puts the counted quantity into the batches the warehouse shipped: a shortfall comes off the latest-expiring batch, and a surplus goes to an unknown-expiry batch. Warehouse check-stock does not count expired stock as available. See [reports](reports.md#batches-and-expiry).

### Expiry alerts

The server checks batches every hour (`inventory.ExpiryAlerts`, started from `cmd/server/main.go`). The people who manage a store's stock (`inventory:manage` at the store), at NMS, JMS and district stores alike, are told once when a batch with stock comes within 3 months of its expiry date (`inventory.batch_expiring`, the `under_3_months` band and below) and once more when it expires (`inventory.batch_expired`). The batch ID is the idempotency key, so a restart or a second server never repeats one. A batch with nothing left, or with no expiry date, is not announced. A store with nobody to tell stores nothing, so its batches are announced once someone there manages its stock.

| Type                       | Sent to                         | Resource      |
| -------------------------- | ------------------------------- | ------------- |
| `inventory.batch_expiring` | `inventory:manage` at the store | `stock_batch` |
| `inventory.batch_expired`  | `inventory:manage` at the store | `stock_batch` |

Their `data` has `store`, `store_id`, `product`, `unit`, `quantity` (on hand when announced), `batch` (the number, or empty), `batch_label` ("batch TGL24155" or "a batch with no number"), `expiry` ("31 Mar 2027") and `expiry_date` (`YYYY-MM-DD`).

## Access

Users see and record stock for their assigned store (`users.store_id`), and a hotspot manager sees their hotspot. District users also see the hotspots their store supplies. `orders:all_stores` extends this to every store and hotspot and is required for the national summary.

Migration 13 grants the inventory permissions to `admin` only. Grant `inventory:read` to roles that report on stock and `inventory:manage` to store staff who receive and count it, through `PUT /api/v1/roles/{id}/permissions`. The migration also turned existing balances into `opening` entries, so each store's ledger adds up to its balance. The legacy `condom_inventories` and `hot_spot_stocks` tables are not part of these reports.
