# Reports

[Module architecture](README.md)

The reports module serves the programme reports described in the reporting requirements (draft v0.2). Every figure is calculated on request from source records, using the same notification facts as the orders screens, so a total and the records behind it always agree (RN02).

| Method | Route                                        | Permission          |
| ------ | -------------------------------------------- | ------------------- |
| GET    | `/api/v1/reports/notifications`              | `reports:read`      |
| GET    | `/api/v1/reports/notifications/records`      | `reports:read`      |
| GET    | `/api/v1/reports/warehouse-requests`         | `reports:read`      |
| GET    | `/api/v1/reports/warehouse-requests/records` | `reports:read`      |
| GET    | `/api/v1/reports/stock`                      | `reports:read`      |
| GET    | `/api/v1/reports/batches`                    | `reports:read`      |
| GET    | `/api/v1/reports/expiry-exceptions`          | `reports:read`      |
| GET    | `/api/v1/reports/settings`                   | `reports:read`      |
| POST   | `/api/v1/reports/settings`                   | `reports:configure` |
| GET    | `/api/v1/reports/hmis-105`                   | `reports:read`      |

## Notification fulfilment

A hotspot stockout notification names Male, Female or Both and no quantity. The district delivers against it and the hotspot's manager acknowledges the pieces received; see [orders](orders.md#1a-the-district-delivers-and-the-hotspot-manager-acknowledges). Each notification has one status:

| Status                     | Meaning                                                             |
| -------------------------- | ------------------------------------------------------------------- |
| `awaiting_supply`          | Nothing delivered yet                                               |
| `awaiting_acknowledgement` | Delivered, but no positive acknowledgement yet                      |
| `partly_received`          | Some selected types acknowledged, not all                           |
| `fulfilled`                | The manager acknowledged a positive receipt for every selected type |

`GET /api/v1/reports/notifications` reports on notifications **raised in the period**:

- **Notifications raised**, counted once each; repeated messages against an open notification are not counted again. `by_selection` splits them by Male, Female and Both.
- **Notifications fulfilled**: raised in the period and fully acknowledged by `data_updated_at`. Dispatch or delivery entry alone does not count. `acknowledgements_through` states the time up to which acknowledgements are included.
- **Fulfilment rate**: fulfilled divided by raised, as a percentage to one decimal. With no notifications it is `null` (Not applicable).
- **Component**: with `category=male` or `female`, the report covers notifications that include that type, and `component` gives that type's part. A Both notification counts under each type, so the two components exceed the unique total.
- **Response**: the median hours from notification to the last acknowledgement needed, among fulfilled notifications, with the pending count and the oldest pending age. The clock starts when the notification was first raised; a repeat does not restart it.
- **Deadline**: notifications fulfilled within the deadline divided by those raised, against the on-time target (see [response settings](#response-settings)), and open notifications already past the deadline. For a period still in progress this is progress to date.
- **Backlog**: open notifications raised before the period, kept apart from it.
- **Acknowledgement overdue**: a quality issue, counting notifications with a delivery left unacknowledged for longer than the deadline.
- **Districts**: raised, fulfilled and rate per district, for comparison.

`GET /api/v1/reports/notifications/records` lists the notifications behind those totals for the same filters, newest first, with the pieces delivered and acknowledged per type, the response time and the overdue flag. Filter by `status` and page with `limit` and `offset`. `GET /api/v1/orders/stockouts/{id}` opens one notification's deliveries, acknowledgements and history.

## Warehouse requests

`GET /api/v1/reports/warehouse-requests` reports on district requests to the national warehouses raised in the period, in total and `by_type` (male, female), `by_warehouse` and `by_district`:

- **Requested, approved, issued and acknowledged pieces.** Requested is the original request. Approved is what the warehouse approved at review, which may be less ([orders](orders.md)). Issued is what it dispatched, and acknowledged is what the district counted on receipt.
- **Quantity fulfilment rate**: acknowledged pieces divided by originally requested pieces, as a percentage to one decimal.
- **Fully received, partly received and pending**: a request is fully received when the district counted at least the quantity requested.
- **Response**: median hours from the request to the district's receipt, with the pending count and the oldest pending age.
- **Unconverted**: a quality issue. Quantities convert to pieces with the product's `pieces_per_unit` in its catalogue unit; requests in another unit, or for a product without pieces per unit, are left out of the piece totals and counted here.

`GET /api/v1/reports/warehouse-requests/records` lists the requests behind those totals, newest first, in units and pieces. Filter both by `warehouse_store_id`, `district_id` and `category`.

## Store stock

`GET /api/v1/reports/stock` is a current, dated view of stock at warehouses and district stores, separate from any reporting period (`stock_date`). Each line is a store, product and unit:

- **Physical, reserved, expired, unknown expiry, usable and in transit.** Usable is physical less expired, unknown-expiry and reserved stock, at least zero; unknown-expiry stock needs its batch reviewed before it counts. In transit is stock dispatched to the store and not yet received, counted once. Pieces are given when the stock is held in the product's catalogue unit.
- **Batches reconciled**: whether the store's batches add up to the physical balance.
- **Reconciled**: whether the inventory ledger adds up to the physical balance.
- **Months of stock**: usable stock divided by average monthly outward issues over the last three complete Kampala months. Outward issues are warehouse dispatches to districts and district deliveries to hotspots. This is issue-based coverage, not consumption. `coverage_status` explains when it is unavailable: the ledger does not reconcile, the history does not cover the whole window, or nothing was issued.

Filter by `store_id`, `store_type`, `district_id` and `category`.

## Batches and expiry

Stock is held in batches, each with an optional batch number and expiry date; see [inventory](inventory.md#batches-and-expiry). `GET /api/v1/reports/batches` lists the batches in stock, earliest expiry first, with `days_remaining` and a `band` by calendar months left: `expired`, `under_1_month` (red), `under_3_months`, `under_6_months`, `ok`, or `unknown` without an expiry date. Filter by store, store type, district, category and `band`.

`GET /api/v1/reports/expiry-exceptions` lists the batches with under one month left that left a store in the period, with the documented reason, who authorised it and the rule version, newest first.

The draft's six-month warehouse and three-month district dispatch targets are not enforced: each shipped batch's `days_remaining` on the dispatch date is recorded, so they can be reported once approved.

## Response settings

The review cycle (`weekly`, `monthly`, `bimonthly` or `quarterly`), the receipt deadline in days and the on-time target percentage are saved settings (RF07). `POST /api/v1/reports/settings` adds a row for one store, or nationally without `store_id`, applying from `effective_from` (today or later) and recording who set it and why. Rows are never changed, so an earlier report can be reproduced with the settings it used.

The settings in effect are the store's own latest row, else the national one, else the draft defaults (monthly, 7 days, 80%), and `source` says which. The notification report uses the settings of the filtered district's store, else the user's store, and returns them in `settings`; without `from` and `to` its period is the current review cycle to date. `deadline_days` and `target_percent` parameters still override them for ad hoc analysis. `GET /api/v1/reports/settings` shows the settings in effect for a store or nationally, with their history.

A user sets targets for their assigned store only (RN11); national settings and other stores need `orders:all_stores`.

## HMIS 105 readiness

`GET /api/v1/reports/hmis-105?month=YYYY-MM` prepares 105-CT11 Female and 105-CT12 Male condoms in pieces from hotspot managers' acknowledged receipts, dated by the acknowledgement in Kampala time and grouped by the hotspot's district and subcounty (RF14). Lines delivered in the month but not yet acknowledged are shown as a quality issue and not counted. These figures are evidence of supply, not condoms dispensed: the response lists the decisions still pending (the counting event, the dispensing channel and the subcounty reporting units), and `integration_enabled` stays `false`, so nothing is sent to DHIS2. National users see every district, others the district they work in.

## Filters and dates

The notification and warehouse request reports accept `from` and `to` as calendar days in Africa/Kampala (`YYYY-MM-DD`, both included), defaulting to the current review cycle to date for notifications and the current month to date for warehouse requests, and `district_id`, `hot_spot_id`, `category`, `deadline_days` and `target_percent`. Timestamps are stored with their time zone and periods are cut at Kampala midnight (RN09).

## Access

Access is checked on the server for every request (RN01). `orders:all_stores` sees every notification, request and store, for national users. Warehouse request and stock reports show other users their assigned store only. For notifications, others see the notifications of their assigned district store, of their assigned hotspot, the ones they sent, and with `orders:stockout_district` the district they work in. Filters only narrow what the user can already see, so another district's data is never returned, including by asking for its hotspot.

Migration 24 grants `reports:read`, and migration 27 `reports:configure`, to `admin` only. Grant it to MoH, district and community reporting roles through `PUT /api/v1/roles/{id}/permissions`, with `orders:all_stores` for national users.

## Not covered yet

These parts of the requirements need decisions or data that do not exist yet:

- **Expiry targets and quarantine (RF16):** the six and three month dispatch targets, the calendar-month boundary rules and who may authorise exceptions await programme approval; quarantined stock is not recorded.
- **Coverage settings (RF11):** the three-month window is the draft's proposal and awaits the supply-chain team's approval.
- **HMIS 105 submission (RF14):** figures are prepared, but the counting event, dispensing channel and reporting units await programme approval, so DHIS2 integration stays disabled.
- **Report versions and exports (RF15, RN04):** totals are live, not saved as approved versions.
