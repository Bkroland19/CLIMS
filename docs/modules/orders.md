# Orders

CLIMS records stock orders between stores: a district store's orders to NMS or JMS (below). Orders use UUIDs for the product, unit of measure, stores and users, and record the authenticated account as `ordered_by_id`.

| Method | Route                 | Permission    |
| ------ | --------------------- | ------------- |
| GET    | `/api/v1/orders`      | `orders:read` |
| GET    | `/api/v1/orders/{id}` | `orders:read` |

Either store can view the order. `orders:all_stores` extends the assigned operation permissions across stores. Lists use `limit` (default 50, maximum 100), `offset` (default 0) and an optional `status`.

The first API slice also had generic store-to-store requests (`POST /api/v1/orders`, `PATCH /api/v1/orders/{id}/fulfill`, statuses `pending` and `fulfilled`). No client used them, and migration 32 removed them with the `orders:create` and `orders:fulfill` permissions. Orders already recorded that way stay readable; no workflow step applies to them (409).

Migration 6 creates the store and geography tables and seeds the national JMS store. Before district staff can use orders, provision their region, district and store with the relevant DHIS2 UIDs, set their account's `store_id` to the store UUID, and assign orders permissions through RBAC. Store and assignment setup currently requires database provisioning. Use existing `condoms` and `unit_of_measures` UUIDs when placing orders.

The supplied legacy dataset has no order rows. The migration archives any rows from other deployments in `legacy_orders` since the old table did not record the product. The legacy seed importer targets that archive.

## Stockout reports and warehouse orders

Two separate flows replace the earlier hotspot alert orders (migration 22). Health facilities are not part of either.

### 1. A hotspot reports a stockout to its DCFPs

A hotspot manager, or a VHT on the hotspot's behalf, sends `POST /api/v1/orders/stockouts` with the hotspot, a `condom_category` of `male`, `female` or `both`, and an optional `message`, e.g. `{"hot_spot_id": "…", "condom_category": "male", "message": "Dispenser empty"}`. It names no product and no quantity, and **creates no order**; the report returns the category as `selection` and the message as `comment`. If the hotspot already has an open notification, the message is counted against it rather than raising a second one (200): its `repeat_count` rises, and naming another type widens its selection (Male then Female is Both). Its history keeps every message. CLIMS records a stockout report (`stockout_reports`) addressed to the store of the hotspot's district and sends that district's DCFPs an `order.stockout_reported` notification. The notification gives the hotspot's name, village, subcounty and district, its latest contact person and phone number, the category, who reported it and the message. Its resource is the hotspot. Other districts are not notified. A hotspot without a district cannot report (422) until its district is set.

`GET /api/v1/orders/stockouts` lists reports newest first: those sent to your district store, about your hotspot, or sent by you (`orders:all_stores`: all). `hot_spot_id` narrows it to one hotspot. Lists use `limit` (default 50, maximum 100) and `offset`.

The report is kept so a retried request still notifies nobody twice, and so a report survives when the district has no DCFP yet. What to order in response is the DCFP's decision, made in flow 2.

### 1a. The district delivers and the hotspot manager acknowledges

The DCFP records each delivery against the notification with `POST /api/v1/orders/stockouts/{id}/deliveries` (`orders:supply_hotspots` at the notification's district store): one or more lines of a product of a selected type and a `quantity` in the product's catalogue unit, an optional `note`, and an optional `client_reference` so a retried send records the delivery once. Each line is converted to pieces with the product's `pieces_per_unit`, taken out of the store's available stock (409 when too little) and written to the inventory ledger as a `hotspot_delivery`. The hotspot's manager accounts are notified (`order.hotspot_delivery`); a contact person without an account is not.

The hotspot's manager acknowledges what arrived with `POST /api/v1/orders/stockouts/{id}/acknowledgements`, giving the pieces actually received per delivery line (zero when nothing came). Only a user assigned to the hotspot can acknowledge: district and national users cannot complete fulfilment. Sending a line's count again is accepted once; a different count returns 409, since corrections must stay visible. The notification is **fulfilled** once every selected type has a positive acknowledgement, and the district is notified (`order.delivery_acknowledged`). Until then its status is `awaiting_supply`, `awaiting_acknowledgement` or `partly_received`. A fulfilled notification accepts no further deliveries, and the hotspot's next stockout opens a new one. `GET /api/v1/orders/stockouts/{id}` shows the deliveries, acknowledgements and history behind the status. [Reports](reports.md) count these records.

A hotspot manager may report for their assigned hotspot (`users.hot_spot_id`). A VHT with `orders:stockout_district` may report for any **active** hotspot in the district they work in: their assigned store's district, or else their assigned subcounty's (`users.DistrictOfUser`). Reports for inactive hotspots or other districts return 403. `orders:all_stores` may report for any hotspot. Products come from the catalogue (`GET /api/v1/catalogue/products`).

### 2. The DCFP orders stock from NMS or JMS

1. The DCFP sends `POST /api/v1/orders/warehouse-requests` with `warehouse_store_id` (NMS or JMS, the national stores from `GET /api/v1/locations/stores`), `condom_category` (`male` or `female`) and `quantity`, e.g. 500 female condoms, and optionally a `comment`. The district names the category, not the product, and no unit (a body with `unit_of_measure_id` or `condom_id` is refused, 400): the order's `condom_id` and `unit_of_measure_id` stay null until the warehouse chooses the product, and the quantity is then counted in that product's catalogue unit. The order is for the DCFP's assigned district store; an account without one is refused (403), even with `orders:all_stores`. It starts `queued`, and the warehouse is notified.
2. Warehouse staff `review` the order, choosing the product to send (`condom_id`, an active product of the requested category; required at the first review, 422 otherwise), which gives the order that product's catalogue unit (422 on `error.condom_id` when the product has none), and optionally approving a smaller `quantity_approved` (the request keeps the original `quantity_needed`), `check-stock` (which reserves the approved quantity, or holds it `on_hold` until stock arrives, when they rerun `check-stock`) and `dispatch` it, optionally with a smaller `quantity_issued` and the transport: `waybill_number` (up to 100 characters), `vehicle_registration` (30), `driver_name` (200) and `driver_phone` (30), each optional, blank meaning not given. Dispatch takes batches first expiry first out and never takes expired stock; a batch with under one month left needs an `expiry_exception_reason` ([inventory](inventory.md#batches-and-expiry)). Each step's quantity is kept in the order's events, so the original request and any revision stay visible. A request held `on_hold` has nothing reserved, so a new `review` may switch it to another product of the same category, and to that product's unit.
3. Until dispatch, the warehouse may instead `reject` the order with a `reason` (required, at most 4,000 characters; 422 on `error.reason` otherwise). A rejection closes the order as `rejected`, keeps the reason in `rejection_reason`, and releases anything `check-stock` reserved. A rejected order takes no further step (409); the DCFP places a new order if the district still needs stock.
4. The district runs `receive` on the dispatched order with the counted `quantity_received`; a mismatch requires a `discrepancy_note`. Receipt credits the counted quantity to the district store.

Workflow actions use `POST /api/v1/orders/{id}/actions/{action}`: `review`, `check-stock`, `reject` and `dispatch` with `orders:process` at the warehouse, `receive` with `orders:receive` at the district store. Run `GET /api/v1/orders?status=on_hold` to review held orders, `?status=rejected` for rejections, and `GET /api/v1/orders/{id}/events` for audit history.

### Alert orders raised before migration 22

Hotspot stockouts used to be orders that the DCFP sent to the hotspot with a rider (`dispatch`, `deliver`) or covered with a linked warehouse request (`request-replenishment`). Those three actions are gone. Alert orders already in the database remain readable as history, but no workflow step applies to them (409). A warehouse request linked to one carries on through review, dispatch and receipt as usual. Migration 22 does not convert them to reports.

### Notifications

Every step notifies people through the shared [notification service](notifications.md), so they appear in each person's central inbox (`GET /api/v1/notifications`) with a message, read state and a link to the hotspot or order. A store is notified through the people holding the permission that acts on the step there, not everyone assigned to it, and the person who acted is never notified of their own step.

| Type                            | Sent to                                                                         | Resource |
| ------------------------------- | ------------------------------------------------------------------------------- | -------- |
| `order.stockout_reported`       | `orders:replenish` at the hotspot's district store (DCFPs)                      | hotspot  |
| `order.hotspot_delivery`        | The hotspot's manager accounts                                                  | hotspot  |
| `order.delivery_acknowledged`   | `orders:supply_hotspots` at the district store                                  | hotspot  |
| `order.replenishment_requested` | `orders:process` at the warehouse                                               | order    |
| `order.replenishment_approved`  | `orders:replenish` at the district store                                        | order    |
| `order.replenishment_rejected`  | `orders:replenish` at the district store                                        | order    |
| `order.shipment_dispatched`     | `orders:receive` at the district store                                          | order    |
| `order.shipment_received`       | `orders:replenish` at the district store, and `orders:process` at the warehouse | order    |

`order.stockout_reported` also carries the report's details in `data`: `report_id`, `hotspot_id`, `hotspot`, `village`, `subcounty`, `district`, `place`, `contact_name`, `contact_phone`, `contact`, `condom_id`, `product`, `reporter` and `message`. Empty details are empty strings. The warehouse steps carry `product`, `unit`, `quantity` (the step's own: ordered, approved, dispatched or counted), `quantity_ordered`, `quantity_dispatched`, `from_store`, `to_store`, `note` (the rejection reason or discrepancy note) and `transport` (e.g. "Waybill WB-104, vehicle UAX 123B"). `review` sends `order.replenishment_approved` with the product chosen and says when less than the order was approved; a rejection quotes its reason; a receipt with a discrepancy quotes the note to the warehouse. The type names keep their earlier spelling so existing notifications stay grouped with new ones. `check-stock` and orders outside the workflow notify nobody. The earlier orders-only inbox, `GET /api/v1/orders/notifications`, was removed in migration 32: no client used it.

### Permissions

Migration 21 adds `orders:stockout_district` and `hotspots:read_district`; migration 24 adds `orders:supply_hotspots` and `reports:read`. Migration 31 grants the warehouse and DCFP roles the order and inventory permissions below by default (the `nms`, `jms` and `dfcp` roles); administrators can change any role's grants in Users & access, and seeds never take a grant away. As with every role, grant other permissions through the RBAC API:

| Who                  | Permissions                                                                                                                         |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Hotspot manager      | `orders:read`, `orders:stockout`                                                                                                    |
| VHT (field app)      | `hotspots:read`, `hotspots:submit`, `hotspots:read_district`, `orders:stockout`, `orders:stockout_district`                         |
| DCFP                 | `orders:read`, `orders:replenish`, `orders:receive`, `orders:supply_hotspots`, `reports:read`, `inventory:read`, `inventory:manage` |
| Warehouse (NMS, JMS) | `orders:read`, `orders:process`, `inventory:read`, `inventory:manage`                                                               |

A VHT without `orders:read` can send reports but not list them. Migration 32 removed the unused `orders:deliver`, `orders:create` and `orders:fulfill`, with their grants. Assign the corresponding hotspot or store to each user. Record verified opening balances per store, product and unit as receipts with `POST /api/v1/inventory/movements` before warehouses check stock (see [inventory](inventory.md)). Dispatch and receipt add their own entries to the inventory ledger.

These operations are exposed in Swagger.
