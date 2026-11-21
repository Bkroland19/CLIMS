# Design system

The visual language of the CLIMS web app. Read this before adding or changing UI.

## Source

The look follows the [SalesOps Dashboard](https://v0.app/templates/salesops-dashboard-9q2Mfgu6cDi)
reference: a 260px sidebar with a green active marker, uppercase table headers, tinted status
chips, DM Sans. Components are shadcn/ui (`radix-nova` style, Radix primitives) on Tailwind CSS 4.

The CLIMS prototype refines it, and wins where the two differ: a 56px top bar, flat 10px cards, a
green-tinted table header, pill status chips and role colours. Its visual spec is
`design/prototype/CLIMS Theme.dc.html` (see `design/IMPLEMENTATION_PLAN.md`).

The reference ships in dark mode only. **Light is this product's theme**: its hues re-pitched for
a white surface. Dark is available from the header toggle and uses the reference's own values. The
app never follows the operating system's preference.

## Tokens

Defined in `src/styles/globals.css`. Always use the token, never a raw colour.

| Token                          | Light                                | Use                                                             |
| ------------------------------ | ------------------------------------ | --------------------------------------------------------------- |
| `background`                   | `#f9fafb`                            | Page canvas; `bg-canvas` adds a faint primary glow at top right |
| `card`, `popover`              | `#ffffff`                            | Surfaces                                                        |
| `foreground`                   | `#0c0d0f`                            | Text                                                            |
| `muted-foreground`             | `#62666d`                            | Secondary text, placeholders (5.8:1 on card)                    |
| `secondary`, `muted`, `accent` | `#f2f3f5`                            | Quiet fills, hover and selected backgrounds                     |
| `border`                       | `#e4e6e9`                            | Card and divider hairlines                                      |
| `input`                        | `#8b9097`                            | Form field outlines (3.2:1, see below)                          |
| `primary`                      | `#45ba50`                            | **Fills only**: primary buttons, active page, progress, markers |
| `primary-foreground`           | `#020203`                            | Text on a primary fill (8.3:1)                                  |
| `success`                      | `#177534`                            | **Green text and icons**; positive status                       |
| `warning`                      | `#a84c06`                            | Caution status                                                  |
| `destructive`                  | `#b71c1c` (dark `#ff6b6a`)           | Errors, destructive actions, negative status                    |
| `info`                         | `#0a6a9b`                            | Informational status                                            |
| `ring`                         | `#2f9e42`                            | Focus ring                                                      |
| `chart-1` … `chart-5`          | blue, green, purple, orange, magenta | Chart series, in that fixed order                               |
| `table-head`                   | `primary` at 7% on `card`            | Table header band (opaque, so sticky cells cover rows)          |
| `role-*`                       | see below                            | Who did something, in timelines and activity feeds              |

Role colours: `role-hotspot-manager` `#1f8fd1`, `role-vht` `#7c5cd6`, `role-dcfp` `#45ba50`,
`role-warehouse` `#e08a2e`, `role-rider` `#c2418f`, `role-moh` (= `info`), `role-system` `#8b9097`.
They are the same in both themes except MOH, which follows `info`. A role dot always sits beside the
role's name: DCFP and warehouse are under 3:1 on white, so the colour may never be the only cue.

Radius is 8px (`rounded-lg`) for controls, 10px (`rounded-card`) for cards and 12px (`rounded-xl`)
for popovers and dialogs. Cards are flat: a 1px `border`, no shadow. Type is DM Sans, self-hosted;
numbers that are compared use `tabular-nums`.

### Sizes

| Thing        | Size                                                                                 |
| ------------ | ------------------------------------------------------------------------------------ |
| Sidebar      | 248px; 56px collapsed to icons; a sheet below 768px                                  |
| Top bar      | 56px (`h-header`), full width above the sidebar and the page                         |
| Controls     | 36px standard (`default`); 32px compact (`sm`, `icon-sm`) in tables and toolbars     |
| Table cells  | 9 × 12px (header 8 × 12px), 16px at the table's outer edges                          |
| Status chips | 22px pill (`status-chip`), 10.5px bold capitals, a dot, a hairline of its own colour |

### Three rules that are easy to get wrong

1. **`primary` is a fill, `success` is text.** The reference green is 2.5:1 on white, which is
   fine behind near-black text and unreadable as text. Green words, links and icons use `success`.
2. **Field outlines use `input`, not `border`.** On a white card the outline is the only thing
   marking a field, so it carries 3:1. Cards and dividers keep the lighter `border`.
3. **Status colours pass on their own tint.** Chips are `bg-<status>/10 text-<status>`; each
   status colour was chosen so its text is at least 4.5:1 on that tint. The word carries the
   meaning; colour only reinforces it. There are five tones: positive (`success`), info, caution
   (`warning`), negative (`destructive`) and neutral. `StatusBadge` looks the tone up from the
   word (`lib/status.ts`); when a word's tone depends on context, as "Received" does, pass `tone`.

### Contrast

Measured (WCAG 2.x relative luminance; tints composited onto `card`) with a script over
`globals.css`. Text needs 4.5:1, icons, outlines and focus indicators 3:1. Re-measure if you
change a token.

| Pair                                                                                 | Light              | Dark               |
| ------------------------------------------------------------------------------------ | ------------------ | ------------------ |
| `muted-foreground` on `card` / `background`                                          | 5.8 / 5.5          | 6.3 / 6.4          |
| `muted-foreground` on `secondary`, `muted` (neutral chip)                            | 5.2                | 5.8                |
| `muted-foreground` on `table-head`                                                   | 5.4                | 5.9                |
| `muted-foreground` on `muted/50` (footers), `warning/5`, `destructive/5` (row tints) | 5.5, 5.4, 5.3      | 6.1, 6.0, 6.0      |
| `success` on `success/10` (positive chip, success alert, good trend)                 | 5.0                | 7.3                |
| `info` on `info/10`                                                                  | 5.1                | 7.7                |
| `warning` on `warning/10` (caution chip, warning alert, bad trend)                   | 4.9                | 7.7                |
| `destructive` on `destructive/10` (negative chip, button)                            | 5.6                | 6.7                |
| `destructive` on `destructive/20` (button hover light, button dark)                  | 4.6                | 5.7                |
| `destructive` on `destructive/30` (button hover, dark only)                          | —                  | 4.7                |
| `destructive/90` on `card` (destructive alert description)                           | 5.7                | 6.0                |
| `warning` / `destructive` text on their `/5` row tint                                | 5.3 / 6.0          | 8.2 / 7.0          |
| `foreground` on any status `/10` tint (alert descriptions)                           | 16.8               | 15.7               |
| `success` on `primary/10` (step numbers)                                             | 5.3                | 7.3                |
| `primary-foreground` on `primary` / `primary/80` (button, hover)                     | 8.3 / 10.0         | 8.3 / 5.5          |
| StatCard icons on `secondary`: info, success, warning, `chart-3`                     | 5.3, 5.2, 5.1, 3.8 | 7.9, 7.5, 7.9, 5.5 |
| `input` on `card` (field outline)                                                    | 3.2                | 3.3                |
| `ring` on `card` (focus indicator)                                                   | 3.5                | 8.1                |

`destructive` was darkened from `#c62828` (4.1:1 on its hover tint) and lifted in dark from
`#f14d4c` (4.0:1 on its dark hover tint). Two pairs stay under the line on purpose, and are never
the only cue: `primary` on white (2.5:1) is a fill behind words, and `ring` at 50% (1.8:1 light)
is only ever the halo around a solid 1px `ring` border. A focus indicator with no border uses a
solid ring: `focus-visible:ring-2 focus-visible:ring-ring`.

### The shell

Top bar (menu toggle, product name, notifications bell, theme, account), then the sidebar and the
page. The sidebar shows the current workspace's labelled sections; an item with things waiting
carries a count pill (a red dot when collapsed to icons), and the foot names the workspace. Under
the top bar, the heading band holds the page title, one line on what the page is for and, when a
section has several pages, its tabs. There is no breadcrumb: the sidebar shows where you are. A
record (a detail page) gets a "Back to <section>" link above its title instead. The band and the
page fill the width beside the sidebar; there is no maximum width. Tabs are links,
each to its own address. All of it comes from `navigation/workspaces.ts`; a page supplies only its
content and, at the top of it, its `PageActions`.

`accent` is deliberately neutral. The reference names its green "accent", but shadcn components
use `accent` for hover backgrounds, which must stay quiet. Its green is this system's `primary`.

## Building blocks

Reach for these before writing markup.

| Need                      | Use                                                                        |
| ------------------------- | -------------------------------------------------------------------------- |
| Page-level buttons        | `components/PageActions` (title and description come from the table)       |
| A list of records         | `components/data-table/DataTable` (search, sort, paging, all states)       |
| Per-row actions           | `components/data-table/RowActions` (`ROW_ACTION_SEPARATOR` groups items)   |
| A headline figure         | `components/StatCard` in a `StatCardGrid` (`trend` adds change and line)   |
| A record's ID and status  | `components/DetailHeader` (progress goes in its band)                      |
| A record's progress       | `components/StepTracker` (state in words above each step)                  |
| History or recent events  | `components/ActivityTimeline` (`connected` or `compact`; role dots)        |
| Needed vs in stock        | `features/inventory/checkStock` and `StockCheckBadge`                      |
| A create or edit form     | `components/form/FormDialog` with `TextField` and `SelectField`            |
| A choice from hundreds    | `components/form/ComboboxField` (a select with a search box; label + hint) |
| Confirming a deletion     | `components/ConfirmDialog` (an alert dialog, never a plain dialog)         |
| A page still loading      | `components/states/PageSkeleton` (`table`, `dashboard`, `detail`, `form`)  |
| Nothing to show           | `components/states/EmptyState`                                             |
| Failed to load            | `components/states/ErrorState` (says what failed, offers retry)            |
| A status word             | `components/StatusBadge` (`tone` overrides the word's lookup)              |
| Change over time          | `components/charts/TrendChart`                                             |
| A few categories compared | `components/charts/ColumnChart`                                            |
| Parts of a whole          | `components/charts/ShareList` (labelled bars, not a donut)                 |
| A figure that is not live | `SampleBadge` on it, or `SampleDataNotice` for a whole page                |

`components/ui/` is generated by the shadcn CLI (`npx shadcn@latest add <name>`). Edit a
primitive only to align it with the tokens above, and keep the edit small so
`npx shadcn@latest diff` stays readable.

## Every screen has

- **A page title** in the heading band (from the navigation table) and one line under it saying what the page
  is for.
- **All five states**: loading (skeletons shaped like the content), empty (with the next step),
  error (what failed, how to recover), partial (missing values show `—`), and populated.
- **Honest data.** A number that is not read from the API is marked as sample data. See the README.
- **Copy that names things.** Buttons say what they do ("Delete user", not "OK"). Errors say what
  happened and what to do next. Sentence case throughout.

## Charts

- Colour comes last, in the fixed `chart-1…5` order. A series keeps its colour when others are
  filtered out. Red is not a series colour; it is reserved for `destructive`.
- 2px lines, area fill at 10%, columns at most 24px wide with a 4px rounded top, solid hairline
  grid, one y-axis.
- Two or more series get a legend; one series is named by the card title.
- Every chart has a tooltip and a table view (`ChartCard` provides the switch), so no value is
  reachable only by hovering.
- Text in a chart uses text tokens, never the series colour.

The light and dark series colours were checked for colour-vision separation and 3:1 against their
surface. If you change one, check the set again.

## Accessibility

Target: WCAG 2.2 AA.

- **Headings.** `h1` is the heading band's title. Sections are `h2`: `CardTitle` and `DetailHeader`
  render one. A card inside a section that already has an `h2` passes its own level:
  `<CardTitle asChild><h3>…</h3></CardTitle>`.
- **Focus after an action.** When a button removes itself (confirming an order, receiving stock,
  following a link inside the page), focus would drop to the page body. `hooks/useFocusWhenLost`
  moves it to the element that says what happened: the shell's `main` after a route change, a
  detail page's status banner (`tabIndex={-1}`) after its status changes. A failed submit focuses
  the first field to fix; its message is linked with `aria-describedby`.
- **Announcements.** `Alert` `default` and `destructive` are `role="alert"`; the tinted variants
  are `role="status"`. A message that is on the page from the start is not a live region:
  `SampleDataNotice` is `role="note"`. A spinner inside a button that also changes its label is
  `aria-hidden`.
- **Colour is never alone.** Status chips carry the word, expiry dates add a warning icon and
  "near expiry" for screen readers, stock bars sit beside "Above minimum" / "Below minimum".
- **Target size.** Controls are at least 24px (`icon-xs`, `xs`). The 16px checkbox and radio are
  always inside their `<label>`, which is the target.

## Print

`window.print()` prints the page without the shell (`globals.css`, `@media print`): the top bar,
sidebar, skip link, every `Button`, toasts and anything marked `data-print-hide`
(`SampleDataNotice`, `PageActions`) are left out, and colours switch to the light values on white
whatever the theme. When the page marks one element `data-print-region`, only that element prints,
at full width: the delivery note on the dispatch page and the goods received note on a warehouse
request. A document a user is expected to print should be one such region.

## Before a screen ships

1. Look at it in a browser at about 1440, 768 and 390px wide, in both themes.
2. Run it against `MOCK_DATA=worst` and `MOCK_DATA=empty`. Nothing may overflow the page, hide a
   row's actions, or print `null`, `undefined` or `NaN`.
3. Tab through it. Every control is reachable, shows focus, and has a name. Dialogs trap focus and
   Escape closes them.
4. Make each request fail (`MOCK_FAIL=<resource>`) and check the message is useful and safe.
5. Check the browser console is empty.
