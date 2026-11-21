import { ArrowDown, ArrowUp, ArrowUpDown, Inbox, Search, SearchX } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';

import { EmptyState } from '@/components/states/EmptyState';
import { ErrorState } from '@/components/states/ErrorState';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatNumber, formatText } from '@/lib/format';
import {
  filterRows,
  nextSort,
  pageLinks,
  paginate,
  sortRows,
  type CellValue,
  type SortState,
} from '@/lib/table/tableModel';
import { cn } from '@/lib/utils';

import { TableViewMenu } from './TableViewMenu';
import { useTablePreferences, type TableDensity } from './useTablePreferences';

export interface DataTableColumn<Row> {
  id: string;
  header: string;
  /** The value sorted and searched on; also what is shown unless `cell` is given. */
  value: (row: Row) => CellValue;
  /** Custom rendering, e.g. a badge. Sorting and search still use `value`. */
  cell?: (row: Row) => ReactNode;
  /** Defaults to true. */
  sortable?: boolean;
  /** Right-aligns numeric columns so digits line up. */
  numeric?: boolean;
  /** Offered in the View menu, so a viewer can hide it. Needs `preferencesKey` on the table. */
  hideable?: boolean;
  /** Starts hidden until the viewer shows it. Implies `hideable`. */
  defaultHidden?: boolean;
}

/** Ticked rows, by id, for actions on several rows at once. */
export interface DataTableSelection<Row> {
  selected: ReadonlySet<string>;
  onChange: (selected: Set<string>) => void;
  /** Names a row in its checkbox's label, e.g. the user's name. */
  rowLabel: (row: Row) => string;
}

interface DataTableProps<Row> {
  /** Names the table for assistive technology, e.g. "Users". */
  label: string;
  columns: readonly DataTableColumn<Row>[];
  rows: readonly Row[] | undefined;
  getRowId: (row: Row) => string | number;
  isLoading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  isRetrying?: boolean;
  searchPlaceholder?: string;
  /** Shown when there are no rows at all. */
  emptyTitle: string;
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
   * Turns on the View menu (columns, row height, rows per page) and remembers
   * the viewer's choices in this browser under this key, e.g. "users".
   */
  preferencesKey?: string;
  /** The order rows start in, before the viewer sorts. */
  defaultSort?: SortState;
}

const isHideable = (column: { hideable?: boolean; defaultHidden?: boolean }) =>
  column.hideable === true || column.defaultHidden === true;

const DENSITY_CLASSES: Record<TableDensity, string> = {
  comfortable: 'py-2.25',
  compact: 'py-1',
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
    // The label is the 32px target around the 16px box.
    <label htmlFor={id} className="-m-2 flex size-8 cursor-pointer items-center justify-center">
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
/**
 * Keeps the row menu in view while a wide table scrolls sideways, so acting on
 * a row never requires scrolling to find its controls.
 */
const STICKY_ACTIONS_CLASS = 'sticky right-0 z-10';
/** Cells are 9 × 12px, with 16px at the table's outer edges. */
const EDGE_CLASS = 'px-3 first:pl-4 last:pr-4';
const HEAD_CLASS = cn(
  EDGE_CLASS,
  'text-muted-foreground h-auto py-2 text-xs font-semibold tracking-wider uppercase',
);

/**
 * A searchable, sortable, paginated table. Sorting, filtering and paging run in
 * the browser over the rows it is given (the legacy endpoints return full lists).
 */
export function DataTable<Row>({
  label,
  columns,
  rows,
  getRowId,
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
}: DataTableProps<Row>) {
  const searchId = useId();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortState | null>(defaultSort ?? null);
  const [requestedPage, setRequestedPage] = useState(1);
  const hideable = columns.filter(isHideable);
  const [preferences, setPreferences] = useTablePreferences(preferencesKey, {
    hidden: columns.filter((column) => column.defaultHidden).map((column) => column.id),
    density: 'comfortable',
    pageSize,
  });
  const hidden = new Set(preferences.hidden);
  const shownColumns = columns.filter((column) => !isHideable(column) || !hidden.has(column.id));
  const rowPadding = DENSITY_CLASSES[preferences.density];

  const page = useMemo(() => {
    const all = rows ?? [];
    // Hidden columns are still searched: hiding a column tidies the view, it does not narrow it.
    const filtered = filterRows(all, query, (row) => columns.map((column) => column.value(row)));
    const sorted = sortRows(filtered, sort, (row, columnId) =>
      columns.find((column) => column.id === columnId)?.value(row),
    );
    return paginate(sorted, requestedPage, preferences.pageSize);
  }, [rows, query, sort, requestedPage, preferences.pageSize, columns]);

  const columnCount = shownColumns.length + (rowActions ? 1 : 0) + (selection ? 1 : 0);
  const hasRows = (rows?.length ?? 0) > 0;
  const showError = Boolean(error) && !hasRows;

  const idOf = (row: Row) => String(getRowId(row));
  const pageIds = page.rows.map(idOf);
  const pageSelected = selection ? pageIds.filter((id) => selection.selected.has(id)).length : 0;
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
    const all = pageSelected === pageIds.length;
    for (const id of pageIds) {
      if (all) next.delete(id);
      else next.add(id);
    }
    selection.onChange(next);
  };

  return (
    <div className="flex flex-col gap-4">
      {isLoading || hasRows || toolbar ? (
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full sm:max-w-xs">
            <label htmlFor={searchId} className="sr-only">
              Search {label.toLowerCase()}
            </label>
            <Search
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
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
              className="bg-card pl-9"
              disabled={!hasRows}
            />
          </div>
          {toolbar}
          {preferencesKey ? (
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
          ) : null}
        </div>
      ) : null}

      <div className="bg-card rounded-card overflow-hidden border">
        {showError ? (
          <ErrorState
            title={`Could not load ${label.toLowerCase()}`}
            error={error}
            onRetry={onRetry}
            isRetrying={isRetrying}
          />
        ) : (
          <Table aria-label={label} aria-busy={isLoading}>
            <TableHeader>
              <TableRow className="bg-table-head hover:bg-table-head">
                {selection ? (
                  <TableHead className={cn(HEAD_CLASS, 'w-px')}>
                    <SelectCheckbox
                      checked={pageIds.length > 0 && pageSelected === pageIds.length}
                      indeterminate={pageSelected > 0 && pageSelected < pageIds.length}
                      label={`Select every ${label.toLowerCase()} row on this page`}
                      onChange={togglePage}
                    />
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
                      {column.sortable === false ? (
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
                  <TableHead className={cn(HEAD_CLASS, STICKY_ACTIONS_CLASS, 'bg-table-head w-px')}>
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
                    {hasRows ? (
                      <EmptyState
                        icon={SearchX}
                        title="No matches"
                        description={`Nothing matches “${query.trim()}”. Check the spelling or clear the search.`}
                        action={
                          <Button
                            variant="outline"
                            onClick={() => {
                              setQuery('');
                            }}
                          >
                            Clear search
                          </Button>
                        }
                      />
                    ) : (
                      <EmptyState
                        icon={Inbox}
                        title={emptyTitle}
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
                  return (
                    <TableRow
                      key={id}
                      aria-selected={selection ? isSelected : undefined}
                      data-state={isSelected ? 'selected' : undefined}
                      className={isSelected ? 'bg-primary/5 hover:bg-primary/8' : undefined}
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
                      {shownColumns.map((column) => (
                        <TableCell
                          key={column.id}
                          className={cn(
                            EDGE_CLASS,
                            'max-w-64 truncate',
                            rowPadding,
                            column.numeric && 'text-right tabular-nums',
                          )}
                        >
                          {column.cell ? (
                            column.cell(row)
                          ) : (
                            // Long values are clipped to keep rows one line tall;
                            // the full text stays available on hover.
                            <span title={formatText(column.value(row))}>
                              {formatText(column.value(row))}
                            </span>
                          )}
                        </TableCell>
                      ))}
                      {rowActions ? (
                        <TableCell
                          className={cn(
                            STICKY_ACTIONS_CLASS,
                            EDGE_CLASS,
                            'bg-card py-1 text-right',
                            // Opaque, so the sticky cell still covers what scrolls under it.
                            isSelected &&
                              'bg-[color-mix(in_oklab,var(--color-primary)_5%,var(--color-card))]',
                          )}
                        >
                          {rowActions(row)}
                        </TableCell>
                      ) : null}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        )}

        {!showError && page.total > 0 ? (
          <div className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-muted-foreground text-sm tabular-nums" aria-live="polite">
              Showing {formatNumber(page.from)}–{formatNumber(page.to)} of{' '}
              {formatNumber(page.total)}
            </p>
            {page.pageCount > 1 ? (
              <nav aria-label={`${label} pages`} className="flex flex-wrap items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={page.page === 1}
                  onClick={() => {
                    setRequestedPage(page.page - 1);
                  }}
                >
                  Previous
                </Button>
                {pageLinks(page.page, page.pageCount).map((link, index) =>
                  link === 'gap' ? (
                    <span
                      key={`gap-${index}`}
                      className="text-muted-foreground px-1"
                      aria-hidden="true"
                    >
                      …
                    </span>
                  ) : (
                    <Button
                      key={link}
                      variant={link === page.page ? 'default' : 'ghost'}
                      size="icon-sm"
                      className="tabular-nums"
                      aria-label={`Page ${link}`}
                      aria-current={link === page.page ? 'page' : undefined}
                      onClick={() => {
                        setRequestedPage(link);
                      }}
                    >
                      {link}
                    </Button>
                  ),
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={page.page === page.pageCount}
                  onClick={() => {
                    setRequestedPage(page.page + 1);
                  }}
                >
                  Next
                </Button>
              </nav>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
