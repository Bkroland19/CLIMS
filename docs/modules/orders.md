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

1. A hotspot manager, or a VHT on the hotspot's behalf, sends a stockout alert with `POST /api/v1/orders/stockouts`, naming the hotspot and product and optionally a comment. The alert carries no quantity. It goes to the store of the hotspot's district as `queued`, and that district's DCFPs are notified; other districts are not. A hotspot without a district cannot raise an alert (422) until its district is set.
2. The DCFP decides what to send. If the district store has the stock, the DCFP runs `dispatch` with the active district rider's `rider_id`, the `unit_of_measure_id` and the `quantity_issued`. The quantity comes out of the district's available stock, and the rider is notified. Too little available stock returns 409.
3. Otherwise the DCFP runs `request-replenishment` with `warehouse_store_id`, `unit_of_measure_id` and the `quantity` to request. This creates a linked warehouse request, notifies the warehouse and puts the alert `on_hold`. An alert has one open request at a time.
4. Warehouse staff `review` the request, `check-stock` (which reserves it, or holds it until stock arrives, when they rerun `check-stock`) and `dispatch` it, optionally with a smaller `quantity_issued`.
5. The district runs `receive` on the dispatched request with the counted `quantity_received`; a mismatch requires a `discrepancy_note`. Receipt credits the counted quantity to the district store and notifies it. The alert stays on hold until the DCFP sends stock as in step 2.
6. The rider runs `deliver` with a `delivery_note`, and the hotspot manager receives a delivery notification.

`review` and `check-stock` apply only to warehouse requests; an alert goes straight to the DCFP's decision. Migration 17 returned alerts left mid-way by the earlier quantity-based flow to `queued` and released the stock they had reserved.

Workflow actions use `POST /api/v1/orders/{id}/actions/{action}`. Run `GET /api/v1/orders?status=on_hold` to review held orders, `GET /api/v1/orders/{id}/events` for audit history.

### Notifications

Workflow steps notify people through the shared [notification service](notifications.md), so they appear in each person's central inbox (`GET /api/v1/notifications`) with a message, read state and a link to the order. A store is notified through the people holding the permission that acts on the step there, not everyone assigned to it, and the person who acted is never notified of their own step.

| Type                            | Sent to                                                  |
| ------------------------------- | -------------------------------------------------------- |
| `order.stockout_reported`       | `orders:process` at the hotspot's district store (DCFPs) |
| `order.replenishment_requested` | `orders:process` at the warehouse                        |
| `order.shipment_dispatched`     | `orders:receive` at the district store                   |
| `order.shipment_received`       | `orders:process` at the district store                   |
| `order.delivery_assigned`       | The rider the DCFP dispatched                            |
| `order.delivered`               | The hotspot manager who reported the stockout            |

`review`, `check-stock`, holding an alert for replenishment, and orders outside the workflow notify nobody. `GET /api/v1/orders/notifications`, the earlier orders-only inbox, is deprecated: it keeps working until the web and mobile clients use the central inbox, and is then removed.

A hotspot manager may alert for their assigned hotspot (`users.hot_spot_id`). A VHT with `orders:stockout_district` may alert for any **active** hotspot in the district they work in: their assigned store's district, or else their assigned subcounty's (`users.DistrictOfUser`). Alerts for inactive hotspots or other districts return 403. `orders:all_stores` may alert for any hotspot. Products for the alert come from the catalogue (`GET /api/v1/catalogue/products`).

Migration 21 adds both permissions. As with every role, grant them through the RBAC API: for the field app's VHTs, `hotspots:read`, `hotspots:submit`, `hotspots:read_district`, `orders:stockout` and `orders:stockout_district`. Order visibility is unchanged: raising an alert does not by itself let a VHT read it back, since order access follows store, hotspot and rider assignments.

Grant `orders:read` plus `orders:stockout` to hotspot managers, `orders:process`, `orders:replenish` and `orders:receive` to DCFPs, `orders:process` to warehouse staff and `orders:deliver` to riders. Assign the corresponding hotspot or store to each user. Record verified opening balances per store, product and unit as receipts with `POST /api/v1/inventory/movements` before processing orders (see [inventory](inventory.md)). Dispatch and receipt add their own entries to the inventory ledger. The workflow uses those balances for warehouse reservations, dispatch and receipt. Historical stock imports and inventory reconciliation are handled outside this workflow.

These operations are exposed in Swagger. Generic store-to-store requests continue to use the existing fulfillment endpoint. Orders originating from a hotspot stockout or its linked replenishment use the workflow actions.
