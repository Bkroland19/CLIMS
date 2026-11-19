# Orders

CLIMS records stock requests between two distinct stores. Orders use UUIDs for the product, unit of measure, stores and users. The request records the authenticated account as `ordered_by_id` and starts with status `pending`.

| Method | Route                         | Permission       |
| ------ | ----------------------------- | ---------------- |
| GET    | `/api/v1/orders`              | `orders:read`    |
| GET    | `/api/v1/orders/{id}`         | `orders:read`    |
| POST   | `/api/v1/orders`              | `orders:create`  |
| PATCH  | `/api/v1/orders/{id}/fulfill` | `orders:fulfill` |

Either store can view the order. The receiving store creates it and the supplying store fulfills it. `orders:all_stores` extends the assigned operation permissions across stores. Lists use `limit` (default 50, maximum 100) and `offset` (default 0).

Fulfillment records the signed-in handler and one positive issue quantity up to the requested quantity. It closes the order as `fulfilled`, including when the quantity issued is smaller than the quantity requested. A second fulfillment returns HTTP 409. Inventory balances, stock movement transactions and notifications are outside this first API slice.

Migration 6 creates the store and geography tables and seeds the national JMS store. Before district staff can use orders, provision their region, district and store with the relevant DHIS2 UIDs, set their account's `store_id` to the store UUID, and assign orders permissions through RBAC. Store and assignment setup currently requires database provisioning. Use existing `condoms` and `unit_of_measures` UUIDs when placing orders.

The supplied legacy dataset has no order rows. The migration archives any rows from other deployments in `legacy_orders` since the old table did not record the product. The legacy seed importer targets that archive.

## Hotspot stockout workflow

1. A hotspot manager reports a stockout using `POST /api/v1/orders/stockouts`. The order joins the district queue and generates a district notification. Configure `order_hot_spot_routes` to link each hotspot to its district store.
2. The DCFP runs `review` and `check-stock`. The check reserves the full request when available and sends a confirmation to the reporter. An insufficient balance puts the order on hold.
3. The DCFP uses `request-replenishment` on a held order with `warehouse_store_id`. This creates a linked request and notifies the warehouse. Warehouse staff review it, check stock and dispatch it. Warehouse staff can review and recheck a held request after replenishing warehouse stock.
4. The district runs `receive` on the dispatched warehouse request with the counted `quantity_received`. A mismatch requires a `discrepancy_note`. Receipt credits the counted quantity once, and the DCFP can list held orders and review and recheck them.
5. After confirmation, the district runs `dispatch` with the active district rider’s `rider_id`. The rider runs `deliver` with a `delivery_note`. The reporter receives a delivery notification.

Workflow actions use `POST /api/v1/orders/{id}/actions/{action}`. Run `GET /api/v1/orders?status=on_hold` to review held orders, `GET /api/v1/orders/{id}/events` for audit history and `GET /api/v1/orders/notifications` for the in-app inbox. Notifications are persisted for polling.

Grant `orders:read` plus `orders:stockout` to hotspot managers, `orders:process`, `orders:replenish` and `orders:receive` to DCFPs, `orders:process` to warehouse staff and `orders:deliver` to riders. Assign the corresponding hotspot or store to each user. An operator must initialize verified opening balances in `order_store_stock` per store, product and unit before processing orders. The workflow uses those balances for reservation, dispatch and receipt. Historical stock imports and inventory reconciliation are handled outside this workflow.

These operations are exposed in Swagger. Generic store-to-store requests continue to use the existing fulfillment endpoint. Orders originating from a hotspot stockout or its linked replenishment use the workflow actions.
