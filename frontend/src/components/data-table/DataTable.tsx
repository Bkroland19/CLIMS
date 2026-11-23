import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronRight,
  Inbox,
  Search,
  SearchX,
} from 'lucide-react';
import {
  Fragment,
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { EmptyState } from '@/components/states/EmptyState';
import { ErrorState } from '@/components/states/ErrorState';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatNumber, formatText } from '@/lib/format';
import {
  nextSort,
  paginate,
  searchIndex,
  sortRows,
  type CellValue,
  type SortState,
} from '@/lib/table/tableModel';
import { cn } from '@/lib/utils';

import { TableFooterBar, type DataTableMore } from './TableFooterBar';
import { TableViewMenu } from './TableViewMenu';
import { useTablePreferences, type TableDensity } from './useTablePreferences';

export type { DataTableMore } from './TableFooterBar';

export interface DataTableColumn<Row> {
  id: string;
  header: string;
  /**
   * The value sorted, searched and exported; also what is shown unless `cell`
   * is given. Leave it out for a column of inputs or buttons: such a column is
   * not sorted, searched or exported.
   */
  value?: (row: Row) => CellValue;
  /** Custom rendering, e.g. a badge. Sorting and search still use `value`. */
  cell?: (row: Row) => ReactNode;
  /** Defaults to true in a list and false in an embedded table. Needs `value`. */
  sortable?: boolean;
  /** Right-aligns numeric columns so digits line up. */
  numeric?: boolean;
  /** Offered in the View menu, so a viewer can hide it. */
  hideable?: boolean;
  /** Starts hidden until the viewer shows it. Implies `hideable`. */
  defaultHidden?: boolean;
  /** Hides the header text visually, e.g. over a column of buttons. */
  srOnlyHeader?: boolean;
  /** Lets the cell wrap onto several lines instead of clipping to one. */
  wrap?: boolean;
  /**
   * A figure for the footer, worked out over every row that matches the
   * search (all pages, not just the one showing), e.g. the stock on hand.
   */
  total?: (rows: readonly Row[]) => ReactNode;
}

/** Ticked rows, by id, for actions on several rows at once. */
export interface DataTableSelection<Row> {
  selected: ReadonlySet<string>;
  onChange: (selected: Set<string>) => void;
  /** Names a row in its checkbox's label, e.g. the user's name. */
  rowLabel: (row: Row) => string;
  /** What the rows are, plural and lower case, e.g. "users". Defaults to "rows". */
  noun?: string;
}

/** Marks a row, e.g. one that cannot be used or needs attention. */
export type DataTableRowTone = 'default' | 'muted' | 'caution' | 'negative';

interface DataTableProps<Row> {
  /** Names the table for assistive technology, e.g. "Users". */
  label: string;
  columns: readonly DataTableColumn<Row>[];
  rows: readonly Row[] | undefined;
  getRowId: (row: Row) => string | number;
  /**
   * `list` (the default) is a page's list of records: search, sorting, paging,
   * the View menu, its own card. `embedded` is a short, fixed set of lines
   * inside a card (an order's products, the batches to pick, a form's figures):
   * every row, no toolbar, no card of its own, and cells may hold inputs.
   */
  variant?: 'list' | 'embedded';
  isLoading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  isRetrying?: boolean;
  searchPlaceholder?: string;
  /** Shown when there are no rows at all. */
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  /** Renders the trailing actions cell for a row. */
  rowActions?: (row: Row) => ReactNode;
  pageSize?: number;
  /** Adds a checkbox to each row and the header, for bulk actions. */
  selection?: DataTableSelection<Row>;
  /** Filters or other controls, beside the search box. */
  toolbar?: ReactNode;
  /**
   * Remembers the viewer's View menu choices (columns, row height, rows per
   * page) in this browser under this key, e.g. "users". Without it the choices
   * last while the table is on screen.
   */
  preferencesKey?: string;
  /** The order rows start in, before the viewer sorts. */
  defaultSort?: SortState;
  /** A row's detail, shown under it when its chevron is pressed, e.g. its batches. */
  renderExpanded?: (row: Row) => ReactNode;
  /** Names the chevron for a row, e.g. "Show batches of Lifeguard". */
  expandLabel?: (row: Row) => string;
  rowTone?: (row: Row) => DataTableRowTone;
  /** For a list the server pages: offers to load the next batch, and says the count is partial. */
  more?: DataTableMore;
  className?: string;
}

const isHideable = (column: { hideable?: boolean; defaultHidden?: boolean }) =>
  column.hideable === true || column.defaultHidden === true;

const DENSITY_CLASSES: Record<TableDensity, string> = {
  comfortable: 'py-1.5',
  compact: 'py-0.5',
};

const ROW_TONES: Record<DataTableRowTone, string> = {
  default: '',
  muted: 'text-muted-foreground',
  caution: 'bg-warning/5',
  negative: 'bg-destructive/5',
};

/** A native checkbox that can also show "some ticked", which only a property can set. */
function SelectCheckbox({
  checked,
  indeterminate = false,
  label,
  onChange,
}: {
  checked: boolean;
  indeterminate?: boolean;
  label: string;
  onChange: () => void;
}) {
  const id = useId();
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    // The label is the 28px target around the 16px box.
    <label htmlFor={id} className="-m-1.5 flex size-7 cursor-pointer items-center justify-center">
      <Checkbox
        id={id}
        ref={ref}
        checked={checked}
        aria-checked={indeterminate ? 'mixed' : checked}
        aria-label={label}
        onChange={onChange}
      />
    </label>
  );
}

const SKELETON_ROWS = 5;
const NO_ROWS: readonly never[] = [];
/**
 * Keeps the row menu in view while a wide table scrolls sideways, so acting on
 * a row never requires scrolling to find its controls.
 */
const STICKY_ACTIONS_CLASS = 'sticky right-0 z-10';
/** Cells are 6 × 12px (2px when compact), with 16px at the table's outer edges. */
const EDGE_CLASS = 'px-3 first:pl-4 last:pr-4';
const HEAD_CLASS = cn(
  EDGE_CLASS,
  'text-muted-foreground h-auto py-1.5 text-[0.6875rem] font-semibold tracking-wider uppercase',
);
/**
 * From 50 rows a page the table is taller than the screen, so it scrolls inside
 * its card and the header stays in view; shorter pages scroll with the page.
 */
const LONG_PAGE = 50;

/** A safe fragment of an element id from a row id ("a1:b2" → "a1_b2"). */
const idFragment = (id: string) => id.replace(/[^\w-]/g, '_');

/**
 * The one table of the app. As a `list` it searches, sorts and pages in the
 * browser over the rows it is given (the API returns whole lists, or pages a
 * list loads with `more`). As `embedded` it lays out a card's line items in the
 * same style. Users & access is the reference screen for a list.
 */
export function DataTable<Row>({
  label,
  columns,
  rows,
  getRowId,
  variant = 'list',
  isLoading = false,
  error,
  onRetry,
  isRetrying,
  searchPlaceholder = 'Search…',
  emptyTitle,
  emptyDescription,
  emptyAction,
  rowActions,
  pageSize = 10,
  selection,
  toolbar,
  preferencesKey,
  defaultSort,
  renderExpanded,
  expandLabel,
  rowTone,
  more,
  className,
}: DataTableProps<Row>) {
  const embedded = variant === 'embedded';
  const tableId = useId();
  const searchId = useId();
  const [query, setQuery] = useState('');
  // Typing stays responsive on a long list: the filter catches up a frame later.
  const searched = useDeferredValue(query);
  const [sort, setSort] = useState<SortState | null>(defaultSort ?? null);
  const [requestedPage, setRequestedPage] = useState(1);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const hideable = columns.filter(isHideable);
  const [preferences, setPreferences] = useTablePreferences(preferencesKey, {
    hidden: columns.filter((column) => column.defaultHidden).map((column) => column.id),
    density: 'comfortable',
    pageSize,
  });
  const hidden = new Set(preferences.hidden);
  const shownColumns = columns.filter((column) => !isHideable(column) || !hidden.has(column.id));
  const rowPadding = embedded ? 'py-1.5' : DENSITY_CLASSES[preferences.density];
  const canSort = (column: DataTableColumn<Row>) =>
    column.value !== undefined && (column.sortable ?? !embedded);

  const all = rows ?? NO_ROWS;
  // Hidden columns are still searched: hiding a column tidies the view, it does not narrow it.
  const index = useMemo(
    () => searchIndex(all, (row) => columns.map((column) => column.value?.(row))),
    [all, columns],
  );
  const matching = useMemo(
    () =>
      sortRows(index.search(searched), sort, (row, columnId) =>
        columns.find((column) => column.id === columnId)?.value?.(row),
      ),
    [index, searched, sort, columns],
  );
  const page = embedded
    ? paginate(matching, 1, Math.max(1, matching.length))
    : paginate(matching, requestedPage, preferences.pageSize);

  const leading = (selection ? 1 : 0) + (renderExpanded ? 1 : 0);
  const columnCount = leading + shownColumns.length + (rowActions ? 1 : 0);
  const hasRows = all.length > 0;
  const showError = Boolean(error) && !hasRows;
  const isLong = !embedded && page.rows.length >= LONG_PAGE;
  const hasTotals = page.total > 0 && shownColumns.some((column) => column.total);
  const isSearching = searched.trim() !== '';

  const idOf = (row: Row) => String(getRowId(row));
  const pageIds = page.rows.map(idOf);
  const pageSelected = selection ? pageIds.filter((id) => selection.selected.has(id)).length : 0;
  const pageAllSelected = pageIds.length > 0 && pageSelected === pageIds.length;
  const matchingIds = selection && pageAllSelected ? matching.map(idOf) : [];
  const allMatchingSelected = matchingIds.every((id) => selection?.selected.has(id));
  const selectionNoun = selection?.noun ?? 'rows';

  const toggleRow = (id: string) => {
    if (!selection) return;
    const next = new Set(selection.selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selection.onChange(next);
  };
  const togglePage = () => {
    if (!selection) return;
    const next = new Set(selection.selected);
    for (const id of pageIds) {
      if (pageAllSelected) next.delete(id);
      else next.add(id);
    }
    selection.onChange(next);
  };
  const toggleExpanded = (id: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const totalLabel = more?.hasMore
    ? `Total of the ${formatNumber(page.total)} loaded`
    : isSearching
      ? `Total of ${formatNumber(page.total)} matching`
      : `Total of all ${formatNumber(page.total)}`;

  return (
    <div className={cn('flex min-w-0 flex-col gap-3', className)}>
      {!embedded && (isLoading || hasRows || toolbar) ? (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:max-w-xs">
            <label htmlFor={searchId} className="sr-only">
              Search {label.toLowerCase()}
            </label>
            <Search
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
              aria-hidden="true"
            />
            <Input
              id={searchId}
              type="search"
              name="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setRequestedPage(1);
              }}
              placeholder={searchPlaceholder}
              autoComplete="off"
              className="bg-card pl-8"
              disabled={!hasRows}
            />
          </div>
          {toolbar}
          <div className="sm:ml-auto">
            <TableViewMenu
              label={label}
              columns={hideable}
              preferences={preferences}
              onChange={(change) => {
                setPreferences(change);
                if (change.pageSize) setRequestedPage(1);
              }}
            />
          </div>
        </div>
      ) : null}

      <div className={cn('min-w-0', !embedded && 'bg-card rounded-card overflow-hidden border')}>
        {showError ? (
          <ErrorState
            title={`Could not load ${label.toLowerCase()}`}
            error={error}
            onRetry={onRetry}
            isRetrying={isRetrying}
          />
        ) : (
          <>
            {selection && pageAllSelected && matching.length > page.rows.length ? (
              <div
                role="status"
                className="bg-primary/5 flex flex-wrap items-center gap-x-2 gap-y-1 border-b px-4 py-1.5 text-[0.8125rem]"
              >
                {allMatchingSelected ? (
                  <>
                    <span>
                      All {formatNumber(matching.length)} {selectionNoun} are selected.
                    </span>
                    <Button
                      variant="link"
                      size="xs"
                      className="h-auto p-0 text-[0.8125rem]"
                      onClick={() => {
                        selection.onChange(new Set());
                      }}
                    >
                      Clear selection
                    </Button>
                  </>
                ) : (
                  <>
                    <span>
                      All {formatNumber(page.rows.length)} {selectionNoun} on this page are
                      selected.
                    </span>
                    <Button
                      variant="link"
                      size="xs"
                      className="h-auto p-0 text-[0.8125rem]"
                      onClick={() => {
                        selection.onChange(new Set([...selection.selected, ...matchingIds]));
                      }}
                    >
                      Select all {formatNumber(matching.length)} {selectionNoun}
                    </Button>
                  </>
                )}
              </div>
            ) : null}

            <div
              data-slot="table-container"
              className={cn(
                'relative w-full overflow-x-auto',
                isLong && 'max-h-[calc(100dvh-12rem)] min-h-80 overflow-y-auto',
              )}
            >
              <table
                id={tableId}
                data-slot="table"
                aria-label={label}
                aria-busy={isLoading}
                className="w-full caption-bottom text-sm"
              >
                <TableHeader className={cn(isLong && 'sticky top-0 z-20')}>
                  <TableRow className="bg-table-head hover:bg-table-head">
                    {selection ? (
                      <TableHead className={cn(HEAD_CLASS, 'w-px')}>
                        <SelectCheckbox
                          checked={pageAllSelected}
                          indeterminate={pageSelected > 0 && !pageAllSelected}
                          label={`Select every ${label.toLowerCase()} row on this page`}
                          onChange={togglePage}
                        />
                      </TableHead>
                    ) : null}
                    {renderExpanded ? (
                      <TableHead className={cn(HEAD_CLASS, 'w-px pr-0')}>
                        <span className="sr-only">Details</span>
                      </TableHead>
                    ) : null}
                    {shownColumns.map((column) => {
                      const sorted = sort?.columnId === column.id ? sort.direction : null;
                      const SortIcon =
                        sorted === 'asc' ? ArrowUp : sorted === 'desc' ? ArrowDown : ArrowUpDown;
                      return (
                        <TableHead
                          key={column.id}
                          className={cn(HEAD_CLASS, column.numeric && 'text-right')}
                          aria-sort={
                            sorted === 'asc'
                              ? 'ascending'
                              : sorted === 'desc'
                                ? 'descending'
                                : undefined
                          }
                        >
                          {column.srOnlyHeader ? (
                            <span className="sr-only">{column.header}</span>
                          ) : !canSort(column) ? (
                            column.header
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setSort((current) => nextSort(current, column.id));
                              }}
                              className={cn(
                                'hover:text-foreground focus-visible:ring-ring -mx-1 inline-flex items-center gap-1 rounded-sm px-1 tracking-wider uppercase outline-none focus-visible:ring-2',
                                sorted && 'text-foreground',
                              )}
                            >
                              {column.header}
                              <SortIcon className="size-3" aria-hidden="true" />
                            </button>
                          )}
                        </TableHead>
                      );
                    })}
                    {rowActions ? (
                      <TableHead
                        className={cn(HEAD_CLASS, STICKY_ACTIONS_CLASS, 'bg-table-head w-px')}
                      >
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    ) : null}
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {isLoading && !hasRows ? (
                    Array.from({ length: SKELETON_ROWS }, (_, rowIndex) => (
                      <TableRow key={rowIndex} className="hover:bg-transparent">
                        {Array.from({ length: columnCount }, (_, cellIndex) => (
                          <TableCell key={cellIndex} className={cn(EDGE_CLASS, rowPadding)}>
                            <Skeleton className="h-4 w-full max-w-32" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : page.total === 0 ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={columnCount} className="p-0 whitespace-normal">
                        {embedded ? (
                          <p className="text-muted-foreground px-4 py-4 text-center text-sm">
                            {emptyTitle ?? `No ${label.toLowerCase()} yet`}
                            {emptyDescription ? ` ${emptyDescription}` : null}
                          </p>
                        ) : hasRows ? (
                          <EmptyState
                            icon={SearchX}
                            title="No matches"
                            description={
                              more?.hasMore
                                ? `Nothing in the ${formatNumber(all.length)} ${more.noun} loaded so far matches “${searched.trim()}”. Load more to search further back, or clear the search.`
                                : `Nothing matches “${searched.trim()}”. Check the spelling or clear the search.`
                            }
                            action={
                              <div className="flex flex-wrap justify-center gap-2">
                                <Button
                                  variant="outline"
                                  onClick={() => {
                                    setQuery('');
                                  }}
                                >
                                  Clear search
                                </Button>
                                {more?.hasMore ? (
                                  <Button
                                    variant="outline"
                                    disabled={more.isLoading}
                                    onClick={more.onLoadMore}
                                  >
                                    Load more {more.noun}
                                  </Button>
                                ) : null}
                              </div>
                            }
                          />
                        ) : (
                          <EmptyState
                            icon={Inbox}
                            title={emptyTitle ?? `No ${label.toLowerCase()} yet`}
                            description={emptyDescription}
                            action={emptyAction}
                          />
                        )}
                      </TableCell>
                    </TableRow>
                  ) : (
                    page.rows.map((row) => {
                      const id = idOf(row);
                      const isSelected = selection?.selected.has(id) ?? false;
                      const isOpen = renderExpanded !== undefined && expanded.has(id);
                      const detailId = `${tableId}-${idFragment(id)}-detail`;
                      return (
                        <Fragment key={id}>
                          <TableRow
                            aria-selected={selection ? isSelected : undefined}
                            data-state={isSelected ? 'selected' : undefined}
                            className={cn(
                              ROW_TONES[rowTone?.(row) ?? 'default'],
                              embedded && 'hover:bg-transparent',
                              isSelected && 'bg-primary/5 hover:bg-primary/8',
                              isOpen && 'border-b-0',
                            )}
                          >
                            {selection ? (
                              <TableCell className={cn(EDGE_CLASS, rowPadding, 'w-px')}>
                                <SelectCheckbox
                                  checked={isSelected}
                                  label={`Select ${selection.rowLabel(row)}`}
                                  onChange={() => {
                                    toggleRow(id);
                                  }}
                                />
                              </TableCell>
                            ) : null}
                            {renderExpanded ? (
                              <TableCell className={cn(EDGE_CLASS, 'w-px py-0 pr-0')}>
                                <Button
                                  variant="ghost"
                                  size="icon-xs"
                                  className="text-muted-foreground"
                                  aria-expanded={isOpen}
                                  aria-controls={isOpen ? detailId : undefined}
                                  aria-label={expandLabel?.(row) ?? 'Show details'}
                                  onClick={() => {
                                    toggleExpanded(id);
                                  }}
                                >
                                  <ChevronRight
                                    aria-hidden="true"
                                    className={cn(
                                      'transition-transform duration-150 ease-out motion-reduce:transition-none',
                                      isOpen && 'rotate-90',
                                    )}
                                  />
                                </Button>
                              </TableCell>
                            ) : null}
                            {shownColumns.map((column) => (
                              <TableCell
                                key={column.id}
                                className={cn(
                                  EDGE_CLASS,
                                  rowPadding,
                                  embedded
                                    ? 'align-top'
                                    : column.wrap
                                      ? 'whitespace-normal'
                                      : 'max-w-64 truncate',
                                  column.numeric && 'text-right tabular-nums',
                                )}
                              >
                                {column.cell ? (
                                  column.cell(row)
                                ) : column.value ? (
                                  // Long values are clipped to keep rows one line tall;
                                  // the full text stays available on hover.
                                  <span title={formatText(column.value(row))}>
                                    {formatText(column.value(row))}
                                  </span>
                                ) : null}
                              </TableCell>
                            ))}
                            {rowActions ? (
                              <TableCell
                                className={cn(
                                  STICKY_ACTIONS_CLASS,
                                  EDGE_CLASS,
                                  'bg-card py-0 text-right',
                                  // Opaque, so the sticky cell still covers what scrolls under it.
                                  isSelected &&
                                    'bg-[color-mix(in_oklab,var(--color-primary)_5%,var(--color-card))]',
                                )}
                              >
                                {rowActions(row)}
                              </TableCell>
                            ) : null}
                          </TableRow>
                          {isOpen ? (
                            <TableRow id={detailId} className="bg-muted/40 hover:bg-muted/40">
                              <TableCell colSpan={columnCount} className="p-0 whitespace-normal">
                                <div className="py-3 pr-4 pl-4 sm:pl-12">{renderExpanded(row)}</div>
                              </TableCell>
                            </TableRow>
                          ) : null}
                        </Fragment>
                      );
                    })
                  )}
                </TableBody>

                {hasTotals ? (
                  <TableFooter className="bg-muted/50">
                    <TableRow className="hover:bg-transparent">
                      {leading > 0 ? <TableCell colSpan={leading} className="w-px" /> : null}
                      {shownColumns.map((column, columnIndex) => (
                        <TableCell
                          key={column.id}
                          className={cn(
                            EDGE_CLASS,
                            rowPadding,
                            column.numeric && 'text-right tabular-nums',
                            columnIndex === 0 && !column.total && 'text-muted-foreground',
                          )}
                        >
                          {column.total
                            ? column.total(matching)
                            : columnIndex === 0
                              ? totalLabel
                              : null}
                        </TableCell>
                      ))}
                      {rowActions ? (
                        <TableCell
                          className={cn(
                            STICKY_ACTIONS_CLASS,
                            'w-px bg-[color-mix(in_oklab,var(--color-muted)_50%,var(--color-card))]',
                          )}
                        />
                      ) : null}
                    </TableRow>
                  </TableFooter>
                ) : null}
              </table>
            </div>
          </>
        )}

        {!embedded && !showError && (page.total > 0 || more?.hasMore) ? (
          <TableFooterBar label={label} page={page} onPage={setRequestedPage} more={more} />
        ) : null}
      </div>
    </div>
  );
}
