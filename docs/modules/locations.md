# Locations

[Module architecture](README.md)

The locations module is the single source of region, district and subcounty lookups for every feature and client. Forms that ask for a place, such as hotspot submission, use these endpoints instead of feature-specific copies.

| Method | Route                           | Query                                                           |
| ------ | ------------------------------- | --------------------------------------------------------------- |
| GET    | `/api/v1/locations/regions`     | none                                                            |
| GET    | `/api/v1/locations/districts`   | optional `region_id`                                            |
| GET    | `/api/v1/locations/subcounties` | required `district_id`                                          |
| GET    | `/api/v1/locations/stores`      | optional `store_type` (`national` or `district`), `district_id` |
| GET    | `/api/v1/locations/geography`   | none; needs `hotspots:all_districts`                            |

Each returns `[{ "id", "name" }]` sorted by name. Any signed-in, active user can read the lookups; no extra permission is needed. An invalid `region_id`, or a missing or invalid `district_id`, returns HTTP 400.

`/locations/stores` returns `[{ "id", "code", "name", "store_type", "district_id", "district_name" }]`: the national warehouses (`jms`, `nms`) first, then one store per district, named after it. An unknown `store_type` or an invalid `district_id` returns HTTP 400.

To fill a form, load regions, then the chosen region's districts, then the chosen district's subcounties. Features that store a place check the chain themselves: hotspot submission rejects a subcounty outside its district, or a district outside its region.

The lists come from the `regions`, `districts` and `subcounties` tables, which carry DHIS2 UIDs. Migration 16 filled them from the legacy `organization_units`.

## Geography

`/locations/geography` returns the whole tree for the web's **Geography** page: every region with its districts and their subcounties, ordered by name, with the stores and hotspots (`hotspot_count`, `active_hotspot_count`) in each. Most hotspots are converted legacy records with a district and no subcounty, so a district also gives `hotspots_without_subcounty`, and `counts.hotspots_without_district` gives those no district holds. `source` says where the places come from: CLIMS does not sync them from DHIS2, so they change only through migrations. Unlike the place lookups it counts hotspots in every district, including inactive and rejected ones, so it needs `hotspots:all_districts`; anyone else gets HTTP 403.

## Store overview

`GET /api/v1/stores` powers the live MOH Stores page. It requires `inventory:read` and returns only the assigned store; `orders:all_stores` grants the national view. An unassigned user gets `data: []`. This does not change the `/locations/stores` lookup used in forms.

Each row includes `id`, `name`, `kind`, `region`, `district`, `code`, `user_count`, and `on_hand`. The user count includes all accounts assigned to the store. Stock is an array of `{ category, unit_id, unit, quantity }`, aggregated from physical balances, including reserved and expired stock. Different units remain separate; unclassified products have a null category. A store with no stock has `on_hand: []`. National warehouses have no district or region assignment in the database, so those fields are null.
