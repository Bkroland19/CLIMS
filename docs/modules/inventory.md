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
- **Hotspots** reports what each hotspot has been supplied per product: quantity `delivered` and number of `deliveries` in the period, `last_delivered_at`, quantity `in_transit` with a rider, `open_alerts` not yet sent, `on_hold_requests` waiting for the warehouse and `last_stockout_at`. An open alert has no unit until the DCFP acts, so it is reported on a row without one, as it is in the summary. CLIMS does not record consumption at hotspots, so this is supply, not a count of stock on site. Filter by `hot_spot_id` or `condom_id`.
- **Movements** is the ledger behind the balances: every change to a store's on-hand stock, newest first, with `on_hand_after`. Reasons are `opening`, `receipt`, `adjustment`, `dispatch` and `order_receipt`; the last two are written by the [order workflow](orders.md) and link the order. Filter by `store_id`, `condom_id` or `reason`, and page with `limit` and `offset`.
- **Summary** totals each product nationally: warehouse and district stock on hand and available, stock in transit, quantity delivered to hotspots in the period, and open and held hotspot requests.

Hotspot, movement and summary reports accept a period as `from` and `to` dates (`YYYY-MM-DD`, both days included). Hotspot deliveries are dated by the order's last update, which is the delivery.

## Recording stock

`POST /api/v1/inventory/movements` adds a ledger entry and updates the store's balance in one transaction:

- `receipt` adds a positive `quantity`, for example a supplier delivery to the warehouse or opening stock at a new district store.
- `adjustment` corrects stock after a count in either direction and requires a `note`.

Stock cannot fall below what open orders have reserved; such an adjustment returns 409. Order dispatch and receipt continue to move stock themselves and record their own entries.

## Access

Users see and record stock for their assigned store (`users.store_id`), and a hotspot manager sees their hotspot. District users also see the hotspots their store supplies. `orders:all_stores` extends this to every store and hotspot and is required for the national summary.

Migration 13 grants the inventory permissions to `admin` only. Grant `inventory:read` to roles that report on stock and `inventory:manage` to store staff who receive and count it, through `PUT /api/v1/roles/{id}/permissions`. The migration also turned existing balances into `opening` entries, so each store's ledger adds up to its balance. The legacy `condom_inventories` and `hot_spot_stocks` tables are not part of these reports.
