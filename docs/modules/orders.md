# Orders

CLIMS records stock requests between two distinct stores. Orders use UUIDs for the product, unit of measure, stores and users. The request records the authenticated account as `ordered_by_id` and starts with status `pending`.

| Method | Route | Permission |
| --- | --- | --- |
| GET | `/api/v1/orders` | `orders:read` |
| GET | `/api/v1/orders/{id}` | `orders:read` |
| POST | `/api/v1/orders` | `orders:create` |
| PATCH | `/api/v1/orders/{id}/fulfill` | `orders:fulfill` |

Either store can view the order. The receiving store creates it and the supplying store fulfills it. `orders:all_stores` extends the assigned operation permissions across stores. Lists use `limit` (default 50, maximum 100) and `offset` (default 0).

Fulfillment records the signed-in handler and one positive issue quantity up to the requested quantity. It closes the order as `fulfilled`, including when the quantity issued is smaller than the quantity requested. A second fulfillment returns HTTP 409. Inventory balances, stock movement transactions and notifications are outside this first API slice.

Migration 6 creates the store and geography tables and seeds the national JMS store. Before district staff can use orders, provision their region, district and store with the relevant DHIS2 UIDs, set their account's `store_id` to the store UUID, and assign orders permissions through RBAC. Store and assignment setup currently requires database provisioning. Use existing `condoms` and `unit_of_measures` UUIDs when placing orders.

The supplied legacy dataset has no order rows. The migration archives any rows from other deployments in `legacy_orders` since the old table did not record the product. The legacy seed importer targets that archive.
