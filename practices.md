# Engineering practices

These practices apply to CLIMS: the Go API, Next.js web app, mobile app and operational tooling.
Keep changes scoped to the requested work, preserve API contracts, and use existing components
before introducing another implementation. A commit that applies a practice may name its number,
for example `feat(tables): shared column filters (3, 5, 14, 18)`.

| #   | Practice                | How it applies to CLIMS                                                                                                      |
| --- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 1   | Descriptive names       | Use the domain's terms: district store, hotspot, stockout, dispatch, receipt and catalogue unit.                             |
| 2   | Comments say why        | Explain stock allocation, idempotency, permissions and unusual constraints, rather than narrating syntax.                    |
| 3   | DRY                     | Reuse `DataTable`, `Button`, field components, API clients and existing validation functions.                                |
| 4   | Test domain behaviour   | Test quantity rules, date boundaries, filtering, allocation and permission decisions.                                        |
| 5   | One style               | Run ESLint, Prettier, TypeScript, gofmt and the relevant CI checks. Shared-control and table rules are enforced by ESLint.   |
| 6   | Handle every error      | Distinguish empty records, missing assignments, permission refusals and outages. Explain when displayed data could be stale. |
| 7   | Document                | Keep API contracts in OpenAPI and module docs; document shared frontend contracts in `docs/frontend-ui.md`.                  |
| 8   | Optimise where measured | Keep filtering responsive, bound rendered option lists and measure before introducing caching or virtualisation.             |
| 9   | Security first          | Validate at the API boundary; respect store assignments and permissions; never commit secrets or bypass checks.              |
| 10  | Git hygiene             | Keep focused, reviewable changes and preserve unrelated work. Do not commit without authorization.                           |
| 11  | Plan before coding      | Audit existing patterns and describe significant refactors before changing them.                                             |
| 12  | Simplest data structure | Prefer typed arrays, records and sets over unnecessary layers or custom frameworks.                                          |
| 13  | Modular                 | Keep domain logic in features, reusable UI in components and transport in the shared API client.                             |
| 14  | Test edge cases         | Cover empty lists, missing values, invalid dates, reversed ranges, zero quantities, retry ambiguity and denied access.       |
| 15  | Refactor continuously   | Improve the code being touched; avoid unrelated rewrites.                                                                    |
| 16  | No mutable globals      | Keep application state in providers, query caches and component state; inject external dependencies.                         |
| 17  | Changelog               | Record meaningful user-visible changes in `docs/CHANGELOG.md`.                                                               |
| 18  | Single responsibility   | The API enforces business rules; features supply data and actions; shared components own presentation and interaction.       |
| 19  | Memory as well as time  | Bound API payloads, pagination and large option lists. Never describe partially loaded results as complete.                  |
| 20  | Learn from mistakes     | Record recurring bugs, their causes and prevention in `docs/lessons.md`.                                                     |

## Frontend rules

- Record lists use `DataTable`. Fixed line items inside a form or detail card use its `embedded`
  variant, which keeps every line visible. Do not create a second table implementation.
- Use `Button` for actions and links styled as buttons (`asChild`). Use the shared input, select,
  radio and checkbox primitives. Native controls belong inside those primitives.
- Prefer `TextField`, `TextareaField`, `SelectField` and `ComboboxField` for labelled forms. Custom
  compositions must still have labels, associated descriptions/errors and keyboard access.
- Keep validation in the relevant feature or shared validator. Match API limits, reject impossible
  dates and non-finite numbers, and preserve passwords exactly as entered. Client checks do not
  replace server validation.
- Column `value` functions return real sortable/filterable values, including `null` for missing
  values. Use `cell` for display formatting. Declare `filter: 'select'` for categories and
  `filter: 'date'` for ISO dates/timestamps; numeric columns get number ranges automatically.
- Keep filters visible and removable, and retain search/sort/pagination semantics across screens.
  Loaded-page filters are explicitly limited to loaded records; server-side filters remain in the
  URL. Never silently export a filtered subset as if it were a full report.
- Use shared spacing, colour and typography tokens. Check narrow screens, focus states, loading,
  errors and empty states as part of the feature.

## A change is done when

1. Relevant lint, types and tests pass; new domain behaviour and failure cases have tests.
2. New or changed endpoints are reflected in OpenAPI and module documentation.
3. Shared UI changes have been exercised in representative real browser workflows and at a narrow
   viewport. Use test data for writes; do not mutate operational stock to test a screen.
4. A security or validation control has not been weakened to make a test pass.
