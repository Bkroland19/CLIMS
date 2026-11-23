# Catalogue

[Module architecture](README.md)

The condom catalogue: products, and the product types, brands and units of measure they reference. Orders, stock and hotspot supply refer to products by ID, so the catalogue retires records instead of deleting them once anything uses them.

## Records

| Record          | Fields                                                                                          | Unique                      |
| --------------- | ----------------------------------------------------------------------------------------------- | --------------------------- |
| Product         | `category` (`male`, `female`), `type`, `brand`, `unit`, `pieces_per_unit` (1–100,000), `active` | Nothing; duplicates allowed |
| Product type    | `name` (2–40), `note` (up to 120), `active`                                                     | `name`, whatever its case   |
| Brand           | `name` (1–60), `note` (up to 120), `active`                                                     | `name`, whatever its case   |
| Unit of measure | `name` (2–40), `note` (up to 120), `active`                                                     | `name`, whatever its case   |

A product type is how the product reaches people. Migration 23 seeds the three distribution channels of the national condom distribution guidelines: Free (public sector, free to the user), Socially marketed and Commercial. More can be added, renamed or retired like brands.

Every record also has `in_use`, `created_at` and `updated_at`; types, brands and units have `product_count`. A product embeds its type, brand and unit as `{ id, name }` and is written with `type_id`, `brand_id` and `unit_id`.

## Endpoints

| Method | Route                                         | Permission         |
| ------ | --------------------------------------------- | ------------------ |
| GET    | `/api/v1/catalogue/products`                  | Any active user    |
| POST   | `/api/v1/catalogue/products`                  | `catalogue:manage` |
| PATCH  | `/api/v1/catalogue/products/{id}`             | `catalogue:manage` |
| DELETE | `/api/v1/catalogue/products/{id}`             | `catalogue:manage` |
| GET    | `/api/v1/catalogue/{types,brands,units}`      | Any active user    |
| POST   | `/api/v1/catalogue/{types,brands,units}`      | `catalogue:manage` |
| PATCH  | `/api/v1/catalogue/{types,brands,units}/{id}` | `catalogue:manage` |
| DELETE | `/api/v1/catalogue/{types,brands,units}/{id}` | `catalogue:manage` |

Reads are open to every active user because order and stock forms pick from the catalogue. Lists take `?active=true` (for pickers) or `?active=false`.

## Who manages it

`catalogue:manage` is an ordinary permission, so administrators decide which roles hold it under **Users & access → Roles & permissions**. Out of the box `admin`, `nms` and `jms` hold it (migrations 18 and 23), and so does `moh` (migration 18) until an administrator switches it off.

The web app shows the catalogue in two workspaces, with the same screens and tabs (Condoms, Types, Brands, Units of measure):

- **Warehouse** (`/warehouse/catalogue`), under Inventory, where NMS and JMS maintain it.
- **MOH** (`/moh/catalogue`), under Administration.

Add, edit, activate, deactivate and delete appear only for people holding `catalogue:manage`, and never in a workspace opened read-only (MOH looking at the warehouse screens). Everyone else sees the lists and can export them.

## Rules

- **Active.** Inactive products cannot be ordered: `POST /orders` and `POST /orders/stockouts` answer 422 with `error.condom_id`. Stock movements and orders already in progress carry on. Deactivating a type, brand or unit does not change its products; it only stops it being newly chosen.
- **References.** A product's type, brand and unit must exist and be active when chosen. One already on the product may stay after it is deactivated, so the full edit form still saves.
- **In use.** A product is in use when an order, store stock row or stock movement references it, or a legacy `condom_inventories` or `hot_spot_stocks` row references its legacy ID. A type or brand is in use when any product uses it. A unit is in use when a product, order, store stock row, stock movement or legacy inventory row uses it. `DELETE` answers 409 for records in use; deactivate them instead.
- **Condoms per unit.** Units named `Piece` or `Pieces` (ignoring case and surrounding spaces) represent one condom. Their count input is hidden in the web form; the API accepts an omitted count and stores `1`, including when changing from a packaged unit. An explicit count other than `1` is rejected. Strips, boxes and other packages still require a count so reports and hotspot deliveries can convert their quantities accurately.
- **Partial updates.** `PATCH` changes only the fields sent. An empty body is a 400. Deactivating alone is always allowed; any other change, or activating, must leave a product complete.

## Legacy products

Migration 18 reshapes `condoms` in place, so references keep their UUIDs. It archives every earlier row unchanged in `legacy_condoms` and converts it with `import_legacy_condoms()`, which `scripts/prepare_legacy_seed.py` also calls when importing the legacy backup:

- Category and type are matched ignoring case (`Male`, `Free`, `Public`, `Commercial`, "Socially marketed", "Social marketing"); a recognised type is linked to the product type of that name, which is added back if it was renamed or deleted. Brand text becomes a row in `brands`. The legacy unit reference is matched by legacy ID.
- A row whose category, type or brand cannot be recognised is deactivated.
- A row without a unit or pack size stays active but is **incomplete**. Only rows with a `legacy_id` may be incomplete (`condoms_complete_check`); the API requires a complete product on creation, activation or editing, automatically setting the count to one for Piece/Pieces units.

The web app marks incomplete products and offers **Complete details** instead of Activate.

## Responses

Every endpoint uses the standard envelope. Lists are always an array (`response.List`), create answers 201, and delete answers 200 with only a message. Failures:

| Status | When                                                                    | Body                                                        |
| ------ | ----------------------------------------------------------------------- | ----------------------------------------------------------- |
| 400    | Malformed JSON, unknown field, bad ID, empty patch, bad `active` filter | `message`                                                   |
| 404    | The record does not exist                                               | `message`, e.g. "Brand not found."                          |
| 409    | Duplicate type, brand or unit name                                      | `message` and the same text under `error.name`              |
| 409    | Deleting a record in use                                                | `message`, ending "Deactivate it instead."                  |
| 422    | Invalid or missing fields; missing or inactive type, brand or unit      | `message: "validation failed"`, `error: { field: message }` |
| 500    | Anything unexpected                                                     | Generic `message`; the cause is logged with the request ID  |

Messages are written for people, because the web app shows them as they are.
