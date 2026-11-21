# Locations

[Module architecture](README.md)

The locations module is the single source of region, district and subcounty lookups for every feature and client. Forms that ask for a place, such as hotspot submission, use these endpoints instead of feature-specific copies.

| Method | Route                           | Query                                                           |
| ------ | ------------------------------- | --------------------------------------------------------------- |
| GET    | `/api/v1/locations/regions`     | none                                                            |
| GET    | `/api/v1/locations/districts`   | optional `region_id`                                            |
| GET    | `/api/v1/locations/subcounties` | required `district_id`                                          |
| GET    | `/api/v1/locations/stores`      | optional `store_type` (`national` or `district`), `district_id` |

Each returns `[{ "id", "name" }]` sorted by name. Any signed-in, active user can read them; no extra permission is needed. An invalid `region_id`, or a missing or invalid `district_id`, returns HTTP 400.

`/locations/stores` returns `[{ "id", "code", "name", "store_type", "district_id", "district_name" }]`: the national warehouses (`jms`, `nms`) first, then one store per district, named after it. An unknown `store_type` or an invalid `district_id` returns HTTP 400.

To fill a form, load regions, then the chosen region's districts, then the chosen district's subcounties. Features that store a place check the chain themselves: hotspot submission rejects a subcounty outside its district, or a district outside its region.

The lists come from the `regions`, `districts` and `subcounties` tables, which carry DHIS2 UIDs. Migration 16 filled them from the legacy `organization_units`.
