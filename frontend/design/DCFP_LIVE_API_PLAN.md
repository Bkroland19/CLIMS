# Plan: the DCFP workspace on the real API

> **Superseded (2026-11-22).** `main` replaced the orders workflow this plan built on: stockouts
> became notifications that the district delivers against and the hotspot acknowledges, the DCFP
> orders from NMS or JMS with `POST /orders/warehouse-requests`, and `request-replenishment`, rider
> `dispatch` and `deliver` were removed. Merging `main` into `frontend` kept main's DCFP screens
> (`src/features/dcfp`) and bell, and dropped `src/features/district` (except `DistrictContext`),
> the inbox bell, the orders and inbox mocks, and the riders endpoint. What survives from this plan
> is the hotspot review work (statuses, decisions with a comment, the comment thread, history and
> the `/dcfp/hotspots/[id]` page), `readAllPages`, and `store_id` on the session. The rest is kept
> below as history.

Goal: a district condom focal person (DCFP, role `dfcp`) can do their whole job in the web app
against the Go API, with no mock in the path. That job is to review hotspots, act on stockout
alerts, restock from the warehouse, receive shipments, keep the district store's figures right and
follow deliveries.

Today every `/dcfp` screen runs on a made-up contract (`/hotspot-orders`, `/warehouse-requests`,
`/district-store`, `/riders`, `/activity`), served only by `dev/mock/fulfilment.mts`. The hotspot
screens call `/hotspots/{id}/actions/verify`, which the backend no longer has.

Contract sources, newest first: `backend/internal/features/*` on `main`, then `docs/modules/*.md`,
then `docs/api/openapi.json`. The deployed Swagger (https://clims.health.go.ug/docs/, v2.2.0) is
**older** than `main`. It still has hotspot `verify` and stockouts with a quantity. Don't code
against it.

## Decisions (2026-11-21)

1. The `frontend` branch was fast-forwarded to `origin/main` (`0eb2a83`).
2. **Riders:** add a backend endpoint so a DCFP can list their district's riders (Phase 1).
3. **Match the real API.** Remove prototype features the backend doesn't support: male/female on
   one order, batches and first-expiry-first-out picks, waybill/GRN/condition lines, held orders
   linked to a request by hand, and the confirm-then-dispatch split. Monthly reports stay on the
   mock with their sample-data notice until a reports API exists.
4. **After Phase 4 (2026-11-21):** pages carry the API permission they need, so roles without it
   don't see them in the nav; "Dispatch" is "Deliveries" in the nav. MOH is the national level
   (NMS and JMS are organisations under it), so MOH opening `/dcfp` read-only with national scope
   (every store's stock) is intended. Browser checks of Phases 4–5 are deferred to later.

## The real DCFP flow

Source: `backend/internal/features/orders/workflow.go`, `docs/modules/orders.md`, `hotspots.md`,
`inventory.md`, `notifications.md`.

A DCFP has `users.store_id` = their district store, plus these permissions: `orders:read`,
`orders:process`, `orders:replenish`, `orders:receive`, `inventory:read`, `inventory:manage`,
`hotspots:read`, `hotspots:activate`. The server scopes everything to that store or district. The
client sends no district.

**Hotspot review.** A VHT submits a hotspot, which gets `review_status=submitted` and
`status=inactive`. The DCFP can comment (`POST /hotspots/{id}/comments`), activate (`/activate`),
or reject (`/reject`), and later deactivate (`/deactivate`) and reactivate it. Each decision needs a
comment. History: `GET /hotspots/{id}/events`. Detail with the comment thread: `GET /hotspots/{id}`.

**Stockout alert.** An alert is an order with `hot_spot_id` set and `parent_order_id` null. A hotspot
manager or VHT raises it (`POST /orders/stockouts`). It names a product only: `quantity_needed` and
`unit_of_measure_id` are **null** until the DCFP acts. It arrives as `queued`.

The DCFP then makes one of two decisions, using `POST /orders/{id}/actions/{action}`:

- **Send from the district store:** `dispatch` with `{ rider_id, unit_of_measure_id, quantity_issued }`.
  The stock comes out of the store's *available* balance. It returns 409 "not enough available stock",
  or 422 if the rider isn't an active `orders:deliver` user at the store. The alert becomes `dispatched`,
  and the rider then runs `deliver` (mobile) to make it `delivered`.
- **Ask the warehouse:** `request-replenishment` with `{ warehouse_store_id, unit_of_measure_id, quantity }`.
  This returns 201 and creates a **warehouse request**: a child order with `parent_order_id` = the
  alert, `ordered_for_store_id` = the district, `ordered_from_store_id` = a national store, status
  `queued`. The alert becomes `on_hold`. An alert has one open request at a time (otherwise 409).

Both decisions are allowed from `queued` **or** `on_hold`. So once stock arrives, the DCFP dispatches
the held alert the same way.

**Warehouse request** (the warehouse's actions run on the mock warehouse workspace for now):
`queued` → `review` → `reviewed` → `check-stock` → `confirmed` (or `on_hold` until rerun) →
`dispatch` (optionally fewer) → `dispatched`. Then the DCFP runs `receive` with
`{ quantity_received, discrepancy_note? }`; the note is required when the count ≠ `quantity_issued`.
That makes it `received`, credits the district store and writes an `order_receipt` movement. The held
alert stays on hold until the DCFP sends stock.

**District store.** `GET /inventory/stock?store_id=` gives `on_hand`, `reserved`, `available` and
`incoming` per product and unit. `GET /inventory/movements?store_id=&reason=&from=&to=` is the ledger,
paged. `POST /inventory/movements` takes `{ store_id, condom_id, unit_of_measure_id, reason: receipt|adjustment, quantity, note? }`;
an adjustment needs a note, and it returns 409 below reservations. Opening balances must be recorded
as receipts before orders can be processed. `GET /inventory/hotspots` reports supply per hotspot:
`delivered`, `deliveries`, `last_delivered_at`, `in_transit`, `open_alerts`, `on_hold_requests`
and `last_stockout_at`.

**Inbox.** `GET /notifications` (+ `/unread-count`, `/{id}/read`, `/read-all`) with `type`,
`title`, `body`, `resource_type` and `resource_id`. For a DCFP the types are `order.stockout_reported`,
`order.shipment_received`, `hotspot.submitted`, `hotspot.updated`, `hotspot.resubmitted` and
`hotspot.commented`. The `/orders/notifications` and `/hotspots/notifications` inboxes are
deprecated.

**Lookups for names** (orders carry IDs only):

| Need               | Source                                                                            |
| ------------------ | --------------------------------------------------------------------------------- |
| My store           | `GET /auth/me` → `store_id`; `GET /locations/stores?store_type=district`          |
| Warehouses         | `GET /locations/stores?store_type=national`                                       |
| Hotspot name/place | `GET /hotspots?limit=100` (the DCFP's district), `GET /hotspots/{id}`             |
| Product, unit      | `GET /catalogue/products`, `GET /catalogue/units` (any active user)               |
| Riders             | New, Phase 1                                                                      |
| Who did a step     | **Not available.** Show "You" when `actor_id` is me; otherwise name the role from the action |

`GET /orders` filters only by `status`, with `limit` ≤ 100. The client tells alerts from requests
by `hot_spot_id`/`parent_order_id` and pages until a short page comes back (cap it, and say so in
the UI if the cap is hit).

## Progress

- **Phase 1 done (2026-11-21), uncommitted.** `backend/internal/features/orders/riders.go`, route in
  `handler.go`, dispatch's rider check now shares the picker's rule (`riderAt` in `workflow.go`), test
  `internal/integration/riders_test.go`, OpenAPI `listOrderRiders` + `Rider` schema, `orders.md`,
  CHANGELOG. `go test ./...` green against PG 5433.
- **Duplicate migration 20 fixed (2026-11-21), uncommitted:** `000020_vht_district_stockouts` renamed to
  `000021_…` (user's decision); `district_stockouts_test.go`, `orders.md` and CHANGELOG say 21.
  `go test ./...` green. A database that already applied the VHT migration as version 20 needs
  `schema_migrations` looked at before upgrading.
- **Phase 2 done (2026-11-21), uncommitted.** Module: `src/features/district/` (`api.ts`, `queries.ts`,
  `orders.ts` kinds/statuses/"can send now", `names.ts`, `tasks.ts` with `DCFP_PATHS` for the new
  routes, `useDcfpCounts.ts`). Notifications got their own `src/features/notifications/` (the bell is
  for every role). Shared `readAllPages` in `lib/api/pages.ts` (geography's pager uses it). Session
  user now carries `store_id`. Stores come from `features/geography`, products/units from
  `features/catalogue`. Hotspots module on the real shape (`review_status`, nested places,
  `contact_person`, comment-required decisions; `verify` gone); the VHT form, `/dcfp/hotspots` list,
  maps, `dev/mock/hotspots.mts` (pulled forward from Phase 3) and `e2e/hotspots.spec.ts` follow it.
  **Not wired yet:** `AppFrame` still uses `features/fulfilment/useDcfpCounts`; swap it to
  `features/district/useDcfpCounts` in Phase 4 together with the screens (the old mock has no `/orders`).
- **Phase 3 done (2026-11-21), uncommitted.** `dev/mock/orders.mts` serves `/orders` (list, get,
  events, `dispatch` / `request-replenishment` / `receive` with the Go handler's exact 400/403/404/409/422
  messages), `/orders/riders` and `/inventory/stock|hotspots|movements` (+ `POST /inventory/movements`).
  `dev/mock/notifications.mts` serves `/notifications*`; the order and hotspot mocks feed it what the
  API would send Wakiso's DCFP. The mock caller is Wakiso's DCFP: `signedInUser()` now carries Wakiso's
  `store_id`, and steps are recorded under its id (`'1'`). Warehouse steps and `deliver` are refused (403)
  as for a DCFP; the seed runs them through the same workflow code, so balances match the ledger. Demo:
  3 queued alerts, 2 held (Namasuba male can be sent now; Kasenyi female waits on a JMS shipment of 450 to
  receive), 1 with a rider, 3 delivered, NMS request on hold; 21 boxes male, 0 female (+450 incoming);
  riders Musa (1 open) and Peter. `worst` adds 105 more queued alerts (two pages), a 4,000-character
  comment, an alert for a missing hotspot, a legacy `pending` order and a 1,234,567 balance. Admin mock:
  delivery agents hold `orders:deliver` and Wakiso's store; three more active Wakiso hotspots (Kitende
  Trading Centre, Namasuba Lodge, Katabi Fish Market). Catalogue and `/locations/stores` were already
  served. The old `/hotspot-orders` world (`fulfilment.mts`) shares no state with the new one.
- **Phase 4 written (2026-11-21), uncommitted, not yet rendered in a browser.** Screens in
  `src/features/district/`: `DistrictDashboardPage` (tasks, KPIs, store card, activity from
  `/notifications`, alerts-per-week and stockouts-by-sub-county charts from real orders; no sample data),
  `AlertQueuePage` (`?status=`), `HeldAlertsPage`, `AlertPage` (send from store / ask the warehouse,
  outcome, store stock, hotspot card with supply, history), `RequestsPage` (`?status=`), `RequestPage`
  (receive form, then "Send the held alert"), `StorePage` (balances; ledger with `?reason=&from=&to=&page=`;
  "Record stock" dialog behind `inventory:manage`), `DeliveriesPage`. Forms: `SendFromStoreForm`,
  `AskWarehouseForm` (national stores only), `ReceiveForm`, `RecordStockDialog`, on `ActionForm`; rules in
  `forms.ts`, wording in `history.ts`, `ledger.ts`, `dashboard.ts` (all unit-tested). Hotspots:
  `/dcfp/hotspots` has `?review=` tabs and supply columns; new `/dcfp/hotspots/[id]` (`HotspotPage`:
  details, comment thread, history, decisions, add a comment); decision dialog moved to
  `HotspotDecisionDialog.tsx`. Shared: new `components/form/TextareaField.tsx`. Nav table: new
  descriptions and permissions (`orders:read`, `inventory:read`, `hotspots:read`), "Dispatch" is now
  "Deliveries"; `/dcfp/restock/new` and `/dcfp/dispatch/[id]` retired. `AppFrame` uses
  `features/district/useDcfpCounts`. Deleted from `features/fulfilment`: the DCFP pages and their tests,
  `BatchPicker`, `HistoryCard`, `restock`, `sampleCharts`, `tasks`, `useDcfpCounts`. Kept there: what the
  warehouse/MOH screens import (`queries.ts` still exports `fulfilmentKeys`; its hooks and the API
  functions they call are now unused). `e2e/support/routes.ts` samples point at seeded UUIDs.
  Verified: lint clean, full unit suite green after a review-queue test was switched to URL-routed
  replies. **Still to do:** the a11y + visual run on `/dcfp` routes (stopped by the system for low
  memory) and a walk through the screens. `e2e/dcfp.spec.ts` and the DCFP step in
  `e2e/warehouse.spec.ts` (`/dcfp/restock/new`) target the old flow and fail until Phase 6.
- **Phase 5 done (2026-11-21), uncommitted, not yet rendered in a browser.** `NotificationsBell`
  (shared) gained `unreadCount`, unread entries (bold, "Unread:" for screen readers), links that close
  the list, buttons for entries without a page, loading placeholders, an error with retry, an `action`
  slot and `onOpenChange`. `TopBar`/`AppShell` take a `bell` slot instead of a `notifications` list.
  `features/notifications/InboxBell.tsx` feeds it for every role from `AppFrame`: unread count polled
  every 60 s (`refetchInterval`, new on `useApiQuery`), list loaded fresh when opened, opening marks
  read, "Mark all read". `display.ts` picks each type's page by the reader's workspaces (DCFP alert,
  request or hotspot; warehouse request list; `/vht`) and its colour; the dashboard's activity links
  use it too. The deprecated `/hotspots/notifications` "Recent updates" panel and its client code are
  gone. Verified: lint clean, full unit suite green (1,102). The app-shell test that expected "not
  connected yet" now checks the bell reads the inbox.
- **Bell follow-up (2026-11-21):** a rise in the unread count refreshes the district's orders,
  stock and hotspots and an open bell's list (`InboxBell.tsx`), so badges and lists catch up
  straight away. Test in `InboxBell.test.tsx`.
- **Phase 6 (2026-11-21), uncommitted.** `district/DecisionForms.test.tsx`: send, ask, receive and
  record-stock forms (validation, the API's 409 kept with the input and shown beside its field,
  Enter to submit). `e2e/dcfp.spec.ts` rewritten for the live flow (send from store; ask the
  warehouse → held; receive short with a note, then send the held alert; record an adjustment).
  `e2e/hotspots.spec.ts` already covered activate/deactivate/reject with comments. In
  `e2e/warehouse.spec.ts` the DCFP↔warehouse round trip (it began on the removed
  `/dcfp/restock/new`) became a warehouse-only dispatch of WR-2026-0030, since the two sides no
  longer share data. `IMPLEMENTATION_PLAN.md` Phase 4 notes mark the contract as history for
  the DCFP side. Unit suite green (1,110), lint clean.
  **Not run:** the e2e specs (the e2e `next dev` failed to start in the agent's sandbox: Turbopack
  could not spawn its PostCSS worker, 0xc0000142), the a11y/visual sweep, the type-check and
  `npm run build` (commit time), and the manual walk on the mock and the Go API at 360px,
  tablet and desktop, light and dark.
- Next: run `npx playwright test e2e/dcfp.spec.ts e2e/hotspots.spec.ts e2e/warehouse.spec.ts
  --project=forms` and fix what it finds; then `e2e/a11y.spec.ts` and `e2e/visual.spec.ts`
  (update the visual baselines, as the bell shows a badge) and the manual walk.

## Phase 1 — backend: list the district's riders

`GET /api/v1/orders/riders`, permission `orders:process`. It returns active users with
`orders:deliver` whose `store_id` is the caller's store. A caller with `orders:all_stores` must pass
`?store_id=`; without it, 400. Shape:
`{ id, first_name, last_name, phone_number, open_deliveries }`, where `open_deliveries` counts their
`dispatched` hotspot orders, so the picker can show who is already out.

- Register it beside `/stockouts` and `/notifications` in `orders/handler.go`, before `/:id`.
- Integration test in `internal/integration/` (follow `district_stockouts_test.go`): DCFP sees own
  store's riders only, disabled rider hidden, non-rider hidden, missing permission 403.
- OpenAPI entry (`TestOpenAPIRouteCoverage` will fail without it), a row in `docs/modules/orders.md`,
  `docs/CHANGELOG.md`.
- `go test ./...` against local PG (port 5433, see memory `local-dev-ports`).

## Phase 2 — frontend data layer (new module, old one kept)

`features/fulfilment` types and `dev/mock/fulfilment.mts` state are imported by the **warehouse,
MOH and reports** features and mocks (`features/warehouse/*`, `features/moh/*`,
`features/reports/figures.ts`, `dev/mock/warehouse.mts`, `dev/mock/moh.mts`). Don't break them. Build
the live layer as a new module, `src/features/district/` (it already holds `DistrictContext`), or
`src/features/stockouts/`. Pick one, and say which in the report:

- `api.ts`: zod schemas for `Order`, `OrderEvent`, `StockBalance`, `StockMovement`, `HotspotStock`,
  `Store`, `Rider` and `Notification`, matching `docs/api/openapi.json` field for field. Add reads,
  the paged `listAllOrders(status)`, and writes `dispatchAlert`, `requestReplenishment`,
  `receiveRequest` and `recordMovement`. Map 409/422 to user-facing messages through the existing
  `lib/api/errors.ts`.
- `queries.ts`: React Query hooks through `useApiQuery`. Each write invalidates orders, stock and
  notifications, since one action moves all three.
- Pure helpers with unit tests: `kindOf(order)`, task/badge derivation (rewrite `tasks.ts` and
  `useDcfpCounts.ts` for the new shapes), and "held alert can now be sent" (available stock for its
  product > 0).
- Hotspots: update `features/hotspots/api.ts` to the new `Hotspot` shape (`review_status`, nested
  `region`/`district`/`subcounty`, `contact_person`). Add `getHotspot`, `listEvents`, `comment`,
  `activate`, `deactivate` and `reject`. Remove `actOnHotspot` and the `verify` step. The VHT page
  (`/vht`) and MOH map use the same module, so keep them compiling and correct.

## Phase 3 — mock for the real endpoints

Add `dev/mock/orders.mts` (TypeScript) serving the **real** paths and rules: `/orders` (list with
`status`, `limit`, `offset`; get; events; the actions above with the exact 409/422 cases),
`/orders/riders`, `/inventory/stock|movements|hotspots`, `/notifications*`,
`/locations/stores`, and `/catalogue/products|units` if `admin.mts` doesn't already. Update
`dev/mock/hotspots.mts` to the new hotspot endpoints and `review_status`. Seed one district with
queued, on-hold and dispatched alerts, a dispatched warehouse request to receive, and opening
stock. The old `/hotspot-orders` mock stays for the warehouse and MOH workspaces. Note in the report
that the two mock worlds no longer share state.

## Phase 4 — screens

Keep URLs where the meaning holds; `src/navigation/workspaces.ts` is the single list
(`navigation/app.test.tsx` and the e2e route checks read it).

| Route                       | Becomes                                                                                                                                                                                                                                                                                                                       |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/dcfp`                     | Tasks from live data: alerts to decide, held alerts that can now be sent, shipments to receive, hotspots to review. KPIs from `/inventory/stock` and `/inventory/hotspots`. Activity from `/notifications`. Replace the sample charts with ones derived from real data (stock trend from movements' `on_hand_after`, alerts per week from `created_at`) or drop them. No `isSample` left. |
| `/dcfp/orders`              | Queue: alerts, `?status=` filter (queued, on hold, dispatched, delivered). Columns: hotspot, product, raised, comment, status.                                                                                                                                                                                                |
| `/dcfp/orders/held`         | `on_hold` alerts with their warehouse request's status and the store's available stock for the product. "Send now" when it covers it.                                                                                                                                                                                         |
| `/dcfp/orders/[id]`         | **Stockout alert.** Hotspot card (place, contact, supply history), product, comment, store stock for that product by unit, history from `/events`. Two decision forms: *Send from store* (unit, quantity, rider) and *Ask the warehouse* (warehouse, unit, quantity). After the decision it shows the outcome: rider and quantity, or the linked request. |
| `/dcfp/restock`             | Warehouse requests: child orders for my store. Warehouse, product, unit, requested, issued, status, for which hotspot.                                                                                                                                                                                                       |
| `/dcfp/restock/[id]`        | Request detail with history. When `dispatched`: receive form (count defaults to `quantity_issued`, note required if different). After receipt: link to send the held alert.                                                                                                                                                     |
| `/dcfp/restock/store`       | Balances (on hand, reserved, available, incoming); movements ledger with reason/date filters in the URL and paging; "Record stock" dialog (receipt or adjustment), shown only with `inventory:manage`.                                                                                                                          |
| `/dcfp/dispatch`            | Deliveries: alerts `dispatched` (rider, quantity, since) and recently `delivered` with the delivery note.                                                                                                                                                                                                                       |
| `/dcfp/hotspots`            | Review queue with `review_status` tabs; supply columns from `/inventory/hotspots`.                                                                                                                                                                                                                                              |
| `/dcfp/hotspots/[id]` (new) | Hotspot detail: details, comment thread, history, decisions (activate / reject / deactivate, comment required), add a comment.                                                                                                                                                                                                  |
| `/dcfp/hotspot-map`         | Same page on the new hotspot shape.                                                                                                                                                                                                                                                                                            |
| `/dcfp/reports`             | Unchanged (mock, sample notice).                                                                                                                                                                                                                                                                                               |
| `/dcfp/restock/new`         | **Retire.** A warehouse request can only come from an alert, so the form moves onto the alert page.                                                                                                                                                                                                                            |
| `/dcfp/dispatch/[id]`       | **Retire.** Dispatch is one step on the alert page.                                                                                                                                                                                                                                                                            |

Update the nav descriptions (they still say "confirm or hold", "by batch"). Badges: queue =
queued alerts, held = held alerts that can now be sent, restock = requests to receive,
hotspots = submitted. Delete the DCFP-only page files and helpers that nothing else imports
(check `picking.ts`, `batches.ts`, `BatchPicker.tsx`, `restock.ts`, `sampleCharts.ts` against
warehouse/MOH imports before deleting).

Rules that apply throughout (from `~/.claude/CLAUDE.md`): reuse `DataTable`, `RecordView`,
`DetailHeader`, `StatusBadge`, `ActivityTimeline`, `EmptyState`/`ErrorState`, `FieldError`,
`InlineMessage` and `WriteAction`. Handle all four states on every screen. Keep input on failure.
Disable submit while sending. Show dates in Africa/Kampala.

## Phase 5 — notifications bell

Feed `NotificationsBell` from `GET /notifications` and `/unread-count` for every signed-in role. Mark
an item read on open, and add "mark all read". Link `resource_type`/`resource_id` to the alert,
request or hotspot page. Poll on a modest interval (no websocket exists).

## Phase 6 — tests and checks

- Unit tests for the new helpers. Component tests for the alert decision forms, receive form and
  record-stock dialog (validation, server 409 kept-input, keyboard).
- Rewrite `e2e/dcfp.spec.ts` and the DCFP half of `e2e/hotspots.spec.ts` for the new flow: send from
  store; ask warehouse → held; receive with discrepancy; send held alert; record an adjustment;
  activate/reject/deactivate a hotspot with comments. `a11y.spec.ts` and `visual.spec.ts` pick up
  the new routes from the nav table.
- `npm run check` (Node 23.9 on PATH; see memory `local-node-and-checks`). Run the app on the mock
  and on the local Go API (PG 5433, API 8081, `BACKEND_URL=http://127.0.0.1:8081`) and walk the
  whole flow with a seeded DCFP, rider and warehouse user at 360px, tablet and desktop, light and dark.
- Update `design/IMPLEMENTATION_PLAN.md` Phase 4 notes: the fulfilment contract table is now
  history for the DCFP side.

## Known gaps to report at the end

- Names of who did each step: the API returns `actor_id` only, and DCFPs can't read `/users`.
- `GET /orders` has no type filter, so lists page client-side.
- The warehouse and MOH workspaces stay on the mock contract, so their screens won't show the
  DCFP's real requests until they move to the real API. That is the next piece of work.
- Print GRN / delivery note: there is no document in the real flow; removed with the batches.
- Monthly reports: still mock.
