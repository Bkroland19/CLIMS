# Catalogue

[Module architecture](README.md)

The condom catalogue: products, and the brands and units of measure they reference. Orders, stock and hotspot supply refer to products by ID, so the catalogue retires records instead of deleting them once anything uses them.

## Records

| Record          | Fields                                                                                          | Unique                      |
| --------------- | ----------------------------------------------------------------------------------------------- | --------------------------- |
| Product         | `category` (`male`, `female`), `type`, `brand`, `unit`, `pieces_per_unit` (1–100,000), `active` | Nothing; duplicates allowed |
| Brand           | `name` (1–60), `note` (up to 120), `active`                                                     | `name`, whatever its case   |
| Unit of measure | `name` (2–40), `note` (up to 120), `active`                                                     | `name`, whatever its case   |

`type` is the distribution channel from the national condom distribution guidelines: `free` (public sector, free to the user), `socially_marketed` or `commercial`.

Every record also has `in_use`, `created_at` and `updated_at`; brands and units have `product_count`. A product embeds its brand and unit as `{ id, name }`.

## Endpoints

| Method | Route                                   | Permission         |
| ------ | --------------------------------------- | ------------------ |
| GET    | `/api/v1/catalogue/products`            | Any active user    |
| POST   | `/api/v1/catalogue/products`            | `catalogue:manage` |
| PATCH  | `/api/v1/catalogue/products/{id}`       | `catalogue:manage` |
| DELETE | `/api/v1/catalogue/products/{id}`       | `catalogue:manage` |
| GET    | `/api/v1/catalogue/{brands,units}`      | Any active user    |
| POST   | `/api/v1/catalogue/{brands,units}`      | `catalogue:manage` |
| PATCH  | `/api/v1/catalogue/{brands,units}/{id}` | `catalogue:manage` |
| DELETE | `/api/v1/catalogue/{brands,units}/{id}` | `catalogue:manage` |

Reads are open to every active user because order and stock forms pick from the catalogue. Lists take `?active=true` (for pickers) or `?active=false`. Migration 18 grants `catalogue:manage` to `admin` and `moh`.

## Rules

- **Active.** Inactive products cannot be ordered: `POST /orders` and `POST /orders/stockouts` answer 422 with `error.condom_id`. Stock movements and orders already in progress carry on. Deactivating a brand or unit does not change its products; it only stops it being newly chosen.
- **References.** A product's brand and unit must exist and be active when chosen. One already on the product may stay after it is deactivated, so the full edit form still saves.
- **In use.** A product is in use when an order, store stock row or stock movement references it, or a legacy `condom_inventories` or `hot_spot_stocks` row references its legacy ID. A brand is in use when any product uses it. A unit is in use when a product, order, store stock row, stock movement or legacy inventory row uses it. `DELETE` answers 409 for records in use; deactivate them instead.
- **Partial updates.** `PATCH` changes only the fields sent. An empty body is a 400. Deactivating alone is always allowed; any other change, or activating, must leave a product complete.

## Legacy products

Migration 18 reshapes `condoms` in place, so references keep their UUIDs. It archives every earlier row unchanged in `legacy_condoms` and converts it with `import_legacy_condoms()`, which `scripts/prepare_legacy_seed.py` also calls when importing the legacy backup:

- Category and type are matched ignoring case (`Male`, `Free`, `Commercial`, "Socially marketed"). Brand text becomes a row in `brands`. The legacy unit reference is matched by legacy ID.
- A row whose category, type or brand cannot be recognised is deactivated.
- A row without a unit or pack size stays active but is **incomplete**. Only rows with a `legacy_id` may be incomplete (`condoms_complete_check`); the API requires every field to create a product, to activate one, or to edit one.

The web app marks incomplete products and offers **Complete details** instead of Activate.

## Responses

Every endpoint uses the standard envelope. Lists are always an array (`response.List`), create answers 201, and delete answers 200 with only a message. Failures:

| Status | When                                                                    | Body                                                        |
| ------ | ----------------------------------------------------------------------- | ----------------------------------------------------------- |
| 400    | Malformed JSON, unknown field, bad ID, empty patch, bad `active` filter | `message`                                                   |
| 404    | The record does not exist                                               | `message`, e.g. "Brand not found."                          |
| 409    | Duplicate brand or unit name                                            | `message` and the same text under `error.name`              |
| 409    | Deleting a record in use                                                | `message`, ending "Deactivate it instead."                  |
| 422    | Invalid or missing fields; missing or inactive brand or unit            | `message: "validation failed"`, `error: { field: message }` |
| 500    | Anything unexpected                                                     | Generic `message`; the cause is logged with the request ID  |

Messages are written for people, because the web app shows them as they are.
