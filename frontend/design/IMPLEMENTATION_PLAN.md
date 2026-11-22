# CLIMS prototype → web frontend: implementation plan

Source: Claude Design project `aaf44529-fc79-41f2-9ef8-4d7b8e1a2ac3`, entry file
`CLIMS Prototype.dc.html`. A copy of every source file is in `design/prototype/`
(pulled 2026-11-19). Treat it as reference material only: nothing in `src/` may
import from it, and `support.js` is the design tool's runtime, not project code.

## How to read the prototype files

- Each `*.dc.html` is one component. Markup lives in `<x-dc>…</x-dc>` (`sc-if`,
  `sc-for`, `{{ binding }}`); behaviour and sample data live in the
  `<script type="text/x-dc">` block at the end (a `class Component`).
- Line 4 of each file is a huge injected script from the design tool. Skip it:
  `sed -E 's/<script data-omelette-injected>.*<\/script>//' file`.
- `CLIMS Prototype.dc.html` is the shell and router: top bar, sidebar, heading
  band, skeletons, notifications, toasts, the role switcher and the `NAV` table
  (every role's nav groups, page titles, sub-lines and tab names).
- `CLIMS Theme.dc.html` is the visual spec. It says it is built on `DESIGN.md`.
- To see a screen rendered, open the project in claude.ai/design and use the
  role bar at the bottom of the canvas.

## Scope: what is web and what is not

The prototype makes **VHT, hotspot manager and rider mobile-app only** ("This
role works in the CLIMS mobile app only. It has no access to the web system").
Their screens (`VhtWorkspace`, `HotspotManagerWorkspace`, `RiderWorkspace`,
`MobileApp`) belong to `mobile/`, not this plan.

Web roles in the prototype:

| Prototype role | Pages (sidebar → tabs) | Detail pages |
| --- | --- | --- |
| Onboarding (signed out) | Invitation → phone → SMS code → password → check details | — |
| DCFP (district focal person) | Dashboard · Orders (Queue, Held for stock) · Restock (Warehouse requests, District store) · Dispatch · Hotspots · Monthly reports | Review order · New warehouse request · Warehouse request · Dispatch order · Report |
| Warehouse (NMS / JMS, switchable) | District requests · Stock · Monthly reports | District request · Report |
| MOH | Dashboard · Orders (Hotspot orders, Warehouse orders) · Reports (Submissions) · Users & access (Users, Roles & permissions) · Product catalogue (Condoms, Brands, Units of measure) · Stores & locations (Stores, Geography) · Audit log | Order audit trail · Report |

Source files: `Onboarding`, `DcfpWorkspace`, `WarehouseWorkspace`,
`MohWorkspace`, `AdminWorkspace` (MOH administration), `ReportsWorkspace`
(reporting for every role).

## Phase 0 audit: prototype vs current frontend

### Theme (small gaps; `CLIMS Theme.dc.html` vs `src/styles/globals.css`)

Colours, type scale, 8px control radius, focus ring and status chips already
match `DESIGN.md`. Differences:

- Top bar 56px (shell uses `h-16`, 64px).
- Cards: flat, 1px border, **10px** radius, no shadow (DESIGN.md says 12px).
- Canvas `#f6f7f9`/`#f9fafb` with a faint green radial glow (token `#fafafb`).
- Table header tinted `rgba(69,186,80,.07)`, cells 9×12 (16 at the edges).
- Controls 36px standard, 32px compact (tables, toolbars).
- New role colours for timelines: hotspot manager `#1f8fd1`, VHT `#7c5cd6`,
  DCFP `#45ba50`, warehouse `#e08a2e`, rider `#c2418f`, system `#8b9097`.
  These need light and dark tokens.

### Shell

| Prototype | Current | Gap |
| --- | --- | --- |
| Top bar: panel toggle, product mark, notifications bell with popover, user | `AppShell` header with `ThemeToggle`, `UserMenu` | Add bell and notification list; height 56px |
| Sidebar: labelled groups, collapses to icons, count/dot badges, workspace card at the foot | `AppSidebar` from `navGroups.ts` | Add groups, badges and the workspace footer |
| Heading band: breadcrumb (role / section / detail), one-line purpose, tabs | `PageHeader` | Add breadcrumb, sub-line and route-backed tabs |
| Skeletons for table, dashboard, detail and form | `PageLoader`, `ui/skeleton` | Add the four layout skeletons |

### Roles: current routes vs prototype

| Current route group | Prototype | Decision needed |
| --- | --- | --- |
| `/moh` (dashboard, users, distribution, procurement, hotspot-map) | MOH | Rework to prototype nav. Distribution, procurement and hotspot map are not in the prototype. |
| `/dcfp` (dashboard, condoms, stock, orders, evidence, hotspots, hotspot-map) | DCFP | Rework to prototype nav. Condoms and evidence become parts of other pages. |
| `/nms`, `/jms` | Warehouse (one workspace with an NMS/JMS switch) | Merge or keep two routes |
| `/store` | District store is a DCFP tab (Restock → District store) | Folded into DCFP; `/store` retired |
| `/suppliers` | Not in prototype | Keep or retire |
| `/hotspot-manager`, `/delivery` | Mobile only | Retire web routes or keep |

### Backend support (checked `backend/internal/features`)

The Go API has **auth, users and roles (RBAC) only**. It has nothing for
hotspots, orders, warehouse requests, dispatch, deliveries, stock, reports,
stores, geography, audit, invitations or SMS codes. (Update: the product catalogue,
with brands and units, is now in the Go API at `/catalogue`; see `docs/modules/catalogue.md`.) Today the
frontend serves condoms, hotspots and inventory from `dev/mock-api.mjs` and
sample data (`components/SampleData.tsx`).

So, apart from users and roles, every screen in this plan runs on mock data
until the API exists. Rule: each new feature gets a typed `api.ts` and
`queries.ts` like the existing features, with mock responses added to
`dev/mock-api.mjs` and a visible `SampleData` marker. Mocks are never
presented as live. **`dev/mock-api.mjs` is JavaScript; flag it for migration
to TypeScript and don't grow it without agreement (see open decisions).**

## Phases

Each phase finishes with `npm run check` passing, plus a check in the running app at
360px, tablet and desktop width in light and dark mode. Nothing is committed
unless asked.

1. **Foundations.** Migrate `dev/mock-api.mjs` to TypeScript, keeping
   `npm run mock-api` working. Then align `globals.css` and `DESIGN.md` with the theme gaps
   above: card radius, top bar height, canvas, table header tint, control
   heights, role colour tokens (light and dark). Extend `StatusBadge` to the
   prototype's status set. Update or add component tests.
2. **App shell.** Top bar, notifications bell (popover, empty state), sidebar
   groups, badges, icon-collapse and workspace footer, heading band
   (breadcrumb, sub-line, URL-backed tabs), the four layout skeletons.
   `navGroups.ts` gains groups, tabs and detail crumbs. Update
   `navigation/app.test.tsx`.
3. **Shared composed pieces** the role phases need, each built on its second use:
   KPI card with sparkline (extend `StatCard`), status timeline / step tracker
   (with role colours), stock-check row (needed / in stock / short), detail
   header card (ID, status, progress), row action menu (extend `RowActions`).
4. **DCFP workspace:** dashboard, order queue and held-for-stock, review order,
   restock (warehouse requests and district store), new warehouse request,
   dispatch, hotspots.
5. **Warehouse workspace:** NMS/JMS switch, district requests, request detail
   (stock check, accept, issue, hold), stock.
6. **MOH workspace:** dashboard, hotspot and warehouse orders, order audit
   trail.
7. **MOH administration:** users and roles (wired to the real
   `/users` and `/roles` API), product catalogue, brands and units (wired to the real
   `/catalogue` API), stores and geography,
   audit log.
8. **Monthly reports:** DCFP and warehouse submission flow (figures checked
   before sending), MOH submissions list and report detail.
9. **Onboarding:** invitation → phone (+256) → SMS code → password → details.
   Needs auth endpoints that don't exist yet; build the UI behind the mock and
   leave sign-in on the real `/auth/login`.
10. **Hardening:** accessibility review (keyboard, focus, contrast, announced
    errors), end-to-end tests for every form that submits, and removal of
    retired routes.

### Phase 4 notes (DCFP workspace)

> **History for the DCFP side.** `/dcfp` now runs on the live orders, inventory, hotspot and
> notification endpoints (`src/features/district`, `dev/mock/orders.mts`); see
> `DCFP_LIVE_API_PLAN.md`. The contract below still describes the warehouse and MOH screens,
> which stay on `src/features/fulfilment` and `dev/mock/fulfilment.mts` until they move too.

**Fulfilment API contract.** Not yet in the Go API. The client (`src/features/fulfilment/api.ts`)
and the mock (`dev/mock/fulfilment.mts`) use these paths and shapes. Every reply uses the Go
envelope: `{ success: true, data }`, or `{ success: false, message, error?: { field: message } }`.
The server scopes every list to the signed-in DCFP's district. Every screen built on these
shows a sample-data notice until the endpoints exist.

| Method | Path | Body | Response `data` | Errors (as the mock enforces them) |
| --- | --- | --- | --- | --- |
| GET | `/hotspot-orders` | – | `HotspotOrder[]` | – |
| GET | `/hotspot-orders/{id}` | – | `HotspotOrder` | 404 unknown order |
| POST | `/hotspot-orders/{id}/confirm` | `{ approved: {male, female}, lines?: [{product, batch, quantity}] }` | `HotspotOrder` | 404; 409 not queued, or the picks can't be met; 422 approved not whole numbers, zero, or more than requested (`error.male` / `error.female`) |
| POST | `/hotspot-orders/{id}/hold` | `{ reason, approved?: {male, female} }` | `HotspotOrder` | 404; 409 not queued |
| POST | `/hotspot-orders/{id}/release` | `{ lines?: [...] }` | `HotspotOrder` | 404; 409 not on hold, or the picks can't be met; 422 as confirm |
| POST | `/hotspot-orders/{id}/dispatch` | `{ rider_id }` | `HotspotOrder` (with `delivery.note_number`) | 404; 409 not confirmed, or rider not available; 422 no such rider (`error.rider_id`) |
| GET | `/warehouse-requests` | – | `WarehouseRequest[]` | – |
| GET | `/warehouse-requests/{id}` | – | `WarehouseRequest` | 404 unknown request |
| POST | `/warehouse-requests` | `{ warehouse: 'NMS' \| 'JMS', items: {male, female}, linked_orders: string[], note }` | `WarehouseRequest` (status `sent`) | 409 a linked order is not on hold, or already has a request; 422 bad warehouse (`error.warehouse`), nothing requested (`error.items`) |
| POST | `/warehouse-requests/{id}/receive` | `{ lines: [{product, batch, counted, damaged, condition}] (one per waybill line, in order), discrepancy: {type, note} \| null }` | `WarehouseRequest` (with `receipt.grn`) | 404; 409 not dispatched; 422 wrong number of lines, counts not whole numbers, damaged > counted, unknown condition, or a discrepancy with no type / a note under 3 characters (`error.note`) |
| GET | `/district-store` | – | `{ name, district, stock, min_levels, batches[], movements[] }` | – |
| GET | `/riders` | – | `Rider[]` (`status`: available, on_delivery, off_duty) | – |
| GET | `/activity` | – | `Activity[]`, newest first (`reference` = order or request ID) | – |

When `lines` is left out of confirm or release, the server allocates first-expiry-first-out and
skips expired batches, as `suggestPicks` does. Confirming takes stock out of the store and adds
a movement. Receiving adds the accepted pieces by batch and records a movement and a GRN.

**Design decisions.**
- Navigation: Overview (Dashboard); Fulfilment with Orders (Queue, Held for stock, plus
  `[id]` review), Restock (Warehouse requests, District store, plus `new` and `[id]`) and
  Dispatch (plus `[id]`); Network with Hotspots (List, Map). The queue filter is `?status=`, and
  a new request takes `?order=` for the held order it came from.
- The stock check on the review page is client-side UI state. There is no "under review"
  order status. It is valid only for the quantities it was run on: changing them clears it.
- The hold reason is derived from the check ("Not enough stock in the district store" or
  "Held by the district focal person"), not typed.
- The review, new-request, receive and dispatch forms use local state, with validation that
  mirrors the server's rules (whole numbers, no more than requested, picks add up, discrepancy
  note when anything differs). They don't use React Hook Form: they are tables of inputs
  derived from server data, not field lists. Server messages show next to the action, and
  input is kept on failure.
- Badge counts (queue, held orders that can now be released, warehouse requests to receive,
  orders to dispatch) are computed in `AppFrame` by `useDcfpCounts`. It fetches only inside
  `/dcfp` and only once signed in.
- The dashboard charts (store stock trend, weekly orders, stockouts by sub-county) are sample
  data (`sampleCharts.ts`, `isSample`): no endpoint exists for them.

**Gaps.**
- Delivery-note attachment on receipt is skipped: there is no upload API.
- "Print GRN" and "Print delivery note" call `window.print()` on the whole page. A print
  stylesheet or a PDF endpoint is still to do.
- The prototype's hotspot list columns (stock at hotspot, last delivery, entered by) need new
  fields on the hotspot API.
- The server must scope requests, orders and the store by the DCFP's district. The client
  sends no district.
- Monthly reports for the DCFP come in Phase 8.

### Phase 10 notes (hardening)

**Retired routes.** `/hotspot-manager`, `/delivery`, `/suppliers`, `/nms`, `/jms` and `/store` are
gone, with the feature code only they used. The navigation table (`src/navigation/workspaces.ts`)
is the single list of screens: `navigation/app.test.tsx` fails if it and `src/app/(app)` disagree,
and the e2e route checks read it, so a retired route can't linger in either.

**End-to-end tests** (`e2e/`, Playwright, run against the TypeScript mock; see
`playwright.config.ts`). Every action that submits data has a test, and one test covers a server
rejection (a 409 on confirm) keeping the user's input. `a11y.spec.ts` runs axe (WCAG 2.2 A/AA,
serious and critical fail) on every screen in the navigation table, and once on a form dialog with
its errors showing. `visual.spec.ts` opens every screen at 360px, tablet and desktop, light and dark.

**Announced errors.** Submit-time errors use `FieldError` (`role="alert"`), and focus moves to the
first problem only after it has rendered. Errors that appear while typing in a table row use the
shared `InlineMessage` (a polite live region that is always rendered). The account menu's name is
its visible text (WCAG 2.5.3).

**Known limits.**
- axe sees each screen in its first state, plus the one dialog above. Other dialogs, menus and
  later onboarding steps aren't scanned; they were reviewed by hand.
- No manual screen-reader pass (NVDA / VoiceOver) has been done.
- The onboarding resend test relies on a seeded invitation whose code was sent 60s before each
  reset (`dev/mock/onboarding.mts`), because the mock enforces the real 45s wait.

## Decisions (2026-11-19)

1. **Mobile-only roles:** retire the web `/hotspot-manager` and `/delivery`
   routes (Phase 10).
2. **NMS and JMS are stores**, not separate role areas. They are store records
   (national warehouses) that the single Warehouse workspace switches between,
   as in the prototype. `/nms` and `/jms` give way to one `/warehouse`
   workspace. The district store screen moves under DCFP (Restock → District
   store), as in the prototype, and `/store` retires (confirmed 2026-11-20,
   removed in Phase 10).
3. **Suppliers:** retire `/suppliers` (Phase 10).
4. **Mock layer:** migrate `dev/mock-api.mjs` to TypeScript at the start of
   Phase 1, then add new resources to the TypeScript version.

## Still open

1. Backend: which of orders, warehouse requests, dispatch, stock, reports,
   stores, geography, audit and invitations are planned for the Go
   API, and in what order? This sets which phases can go live first.
