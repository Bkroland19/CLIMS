# Changelog

Notable changes to CLIMS. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- **Web app** in `frontend/`, imported from the `LMD_FE` prototype and rebuilt on Next.js 16,
  React 19, TypeScript, Tailwind CSS 4 and shadcn/ui, themed after the SalesOps dashboard reference in light
  mode with an optional dark theme. Decisions are recorded in `docs/adr/0001-frontend-stack.md`.
- Sign-in, sign-out and a route guard. Signing out or an expired session in one browser tab signs
  out the others.
- User management, condom items, condom stock and hotspots: searchable, sortable, paginated tables
  with create, edit and delete, Excel export, and loading, empty and error states.
- A hotspot map that plots the hotspots recorded in the system.
- Stock adjustments must state whether they add or distribute stock; neither is preselected.
- A mock API for developing the UI without a backend, with demo, worst-case and empty datasets
  (`npm run mock-api`).
- Unit and behaviour tests, with coverage enforced at 80% on domain code.
- ESLint (type-aware, strict, accessibility rules) and Prettier, run in CI with tests and build
  (`.github/workflows/ci.yml`).
- Security headers on every page, including a Content-Security-Policy that allows no inline
  script except the ones Next.js writes, each marked with a per-request nonce.
- Condom catalogue API (`/api/v1/catalogue/products`, `/brands`, `/units`) with create, partial
  update, activate, deactivate and delete for unused records, behind the new `catalogue:manage`
  permission (admin and moh). Migration 18 converts legacy products, deactivating unrecognised
  ones and marking those without a unit or pack size as incomplete. See `docs/modules/catalogue.md`.
- The catalogue screens use that API: edit, activate, deactivate and delete products, brands and
  units, a Brands tab, status filters and an Incomplete badge for legacy products.
- Product types are managed catalogue records like brands and units (`/api/v1/catalogue/types`, a
  Types tab), instead of a fixed list. Migration 23 seeds Free, Socially marketed and Commercial,
  keeps every product's type and grants `catalogue:manage` to `nms` and `jms`. Products now send
  `type_id` and return `type` as `{ id, name }`.
- NMS and JMS manage the catalogue from the warehouse workspace (`/warehouse/catalogue`). Who may
  change it is the `catalogue:manage` switch under Users & access → Roles & permissions; a
  workspace opened read-only (MOH looking at the warehouse) shows the catalogue without changes.
- Every response carries an `X-Request-ID`, which the request log records.
- The hotspot map runs on OpenStreetMap with MapLibre GL and reads the Go hotspot endpoints.
  Hotspots cluster into rings split by review status or dispenser state; a single hotspot is a
  pin carrying its venue's glyph. Heatmap and point views, a key that doubles as a filter, search, status, dispenser, venue and region
  filters, a list of the hotspots in view, and a detail panel with the contact person,
  directions, the nearest hotspots, comments and history. A national user's map loads district by
  district, so the database never pages through the whole table. The view is kept in the page
  address, and the hotspots shown export to Excel. The map is held to Uganda with the rest of
  the world dimmed, and draws only positions inside the country (with 3 km for border towns);
  missing, swapped and out-of-country positions are listed for correction instead. See
  `docs/modules/hotspots.md`.

### Changed

- The web app takes the place of the Next.js welcome page added in 2.0.0 and keeps its images,
  Compose services and `BACKEND_URL` rewrites. The frontend CI job also checks formatting, runs
  the tests with coverage and audits shipped dependencies, and the production image accepts an
  optional `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` build argument.
- Screen addresses are consistent and no longer misspelled (for example `/moh/users` instead of
  `/moh/admin/userManagment`).
- The district "Condom items" link opens the condom catalogue. It previously opened a copy of the
  orders placeholder.
- Dashboard figures and charts that are not read from the API are labelled "Sample".
- Hotspot status is chosen from a list (active, pending, inactive) instead of typed freely. A
  record saved with another status keeps it.
- Organisation units are chosen by name instead of entered as a numeric id.
- API validation errors are reported under JSON field names with readable messages
  (`"pieces_per_unit": "Must be at most 100,000."`) instead of Go field names and rule tags.
- New orders and stockout requests reject inactive products.
- A product's type is its distribution channel (free, socially marketed or commercial), and its
  brand is chosen from the brand list. The product minimum level is removed.
- The hotspot map no longer needs a Google Maps key: `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is replaced
  by the optional `NEXT_PUBLIC_MAP_TILES` (empty for OpenStreetMap, `off`, or a tile server's URL)
  and `NEXT_PUBLIC_MAP_ATTRIBUTION`. The Content-Security-Policy names the tile servers instead of
  Google, and `Permissions-Policy` allows location on the app's own pages, for "show my location".
- The new Ministry of Health seal replaces the placeholder product icon in the web app (top bar,
  sign-in, onboarding and access screens, favicon and a new Apple touch icon) and the coat of arms
  on the mobile sign-in screen. On a phone the web top bar shows the seal and "CLIMS"; the
  ministry's name stays for screen readers.

### Removed

- Template leftovers and duplicates from the prototype: dozens of unused or copied components and
  pages, the unlinked "JMS Duplicate" pages and hotspot verification stub, the "Other user" pages
  (a demo grid of fictional people), a US vector map with no data, and placeholder prose in
  Procurement.
- Header search, notification and message menus, which showed template content and did nothing.
- Date-range pickers on order screens, which filtered nothing.
- The "Export PDF" and "Send to MOH" buttons, which did nothing. User management gains a working
  Excel export.
- Ant Design, ApexCharts, styled-components, redux-persist, three unused data-grid libraries,
  webpack, and the `xlsx` package (unpatched advisories on npm).
- `@react-google-maps/api`, with the Google Maps scripts and hosts it needed.

### Security

- Every signed-in screen is behind the route guard. Previously no route was protected.
- The session token is attached to API requests in one place. A rejected token ends the session.
- Sign-out always ends the local session. Previously a network failure left the user signed in.
- Removed a Google Maps API key hardcoded in source; it is now build configuration. **The old key
  remains in the prototype repository's history and should be rotated or restricted.**
- The edit-user form no longer displays the user's existing password, and password fields are
  masked.
- Evidence upload no longer posts files to a third-party mock endpoint. It is switched off until
  the API can store documents.
- API responses are validated against schemas before use; server error details are never shown.
- New passwords must be at least 8 characters.
- Excel exports write text as text, so spreadsheet formulas in data cannot execute.
- The dashboard's hotlinked images and avatar service calls were removed; the app loads no
  third-party resources except Google Maps on the map page.
