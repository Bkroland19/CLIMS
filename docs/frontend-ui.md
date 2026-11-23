# Shared frontend UI

The web app uses IBM Plex Sans and shared UI primitives. [Engineering practices](../practices.md)
are enforced by frontend ESLint: feature screens cannot introduce native controls or a separate
table implementation.

## Tables

Use `frontend/src/components/data-table/DataTable.tsx` for every record list. It provides global
search, column sorting, column filters, paging, row selection, expandable details, totals, loading,
empty and error states. The View menu remembers columns, density and page size when the page supplies
`preferencesKey`. The footer also exposes page size. A background refresh failure leaves the last
records visible with a warning and retry.

Column filters support:

- Text: contains, equals, does not contain.
- Categories (`filter: 'select'`): multiple values, searchable options, OR within the column.
- Numbers (`numeric: true` or `filter: 'number'`): inclusive minimum/maximum, either optional.
- Dates (`filter: 'date'`): inclusive start/end, either optional. Timestamp days use Africa/Kampala.
- All column types: is empty and is not empty.

Different columns combine with AND and also combine with global search. Invalid or reversed ranges
show an error without changing the results. Applying or clearing a filter returns to page one;
totals and selection operate on all matching loaded rows, not only the visible page. Chips show
constraints even when their columns are hidden. Open Filters and choose an existing column to edit
its condition, or remove a chip to clear it.

`value` must return an unformatted string, number or null. `cell` may render dates, amounts, badges
or links. Numeric values must not include unit suffixes or thousands separators; missing dates
must not use sentinel values like `9999`. For fields that should not be filtered, set `filter: false`.
Columns with values can be hidden by default; use `hideable: false` to keep an essential column.
At least one column remains visible. Input-only and action columns are not filtered or hidden.

Filtering is over the supplied rows. Existing page-level URL filters may narrow data at the API.
For a paginated API, pass `more` so the table says records are only partially loaded and lets the
user load further records. Existing report exports keep their stated report scope; table column
filters do not silently change a server-generated report.

Use `variant="embedded"` for fixed line items inside forms/cards. It shares table styling while
keeping every line visible without paging or a filtering toolbar.

## Forms and buttons

Use `Button` variants and sizes for actions, `TextField`/`TextareaField` for labelled values,
`SelectField` for short choices and `ComboboxField` for long searchable lists. `Radio` and
`RadioCardGroup` represent single choices; `Checkbox` represents multiple choices. Do not add raw
HTML controls in feature files. Low-level primitives are reserved for custom compositions such as
password reveal controls and editable table cells with explicit labels.

Field components associate both caller-provided and internal descriptions/errors. Required fields
are marked through native or ARIA semantics; optional fields say so. `FormDialog` focuses the first
invalid field after submission and prevents closing while a save is pending. Validators live in the
feature or `src/lib/validation.ts`, and must match backend bounds and units.

## Checks

Run `npm run lint`, `npm run typecheck` and the affected tests from `frontend`. Shared table/filter
changes need model and interaction tests, plus browser checks on a real list and a narrow viewport.
Check keyboard filter selection, empty matches, API errors, number/date boundaries and hidden-column
filters. Use mock API data for dispatch/write tests.
