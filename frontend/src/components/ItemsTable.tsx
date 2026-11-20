import type { ReactNode } from 'react';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

export interface ItemsTableColumn<Row> {
  id: string;
  header: ReactNode;
  cell: (row: Row) => ReactNode;
  /** Right-aligns the column so digits line up. */
  numeric?: boolean;
  /** Hides the header text visually, e.g. for an actions column. */
  srOnlyHeader?: boolean;
}

interface ItemsTableProps<Row> {
  /** Names the table for assistive technology, e.g. "Quantities". */
  label: string;
  columns: readonly ItemsTableColumn<Row>[];
  rows: readonly Row[];
  getRowId: (row: Row) => string;
  /** Shown in a single row when there are no rows. */
  emptyText?: string;
  /** Marks a row, e.g. one that cannot be used. */
  rowTone?: (row: Row) => 'default' | 'muted' | 'caution' | 'negative';
  className?: string;
}

const EDGE = 'px-3 first:pl-4 last:pr-4';
const ROW_TONES = {
  default: '',
  muted: 'text-muted-foreground',
  caution: 'bg-warning/5',
  negative: 'bg-destructive/5',
} as const;

/**
 * A short, fixed list of line items inside a card: an order's products, the
 * batches to pick, the lines of a waybill. Unlike `DataTable` it has no
 * search, sorting or paging, and cells may hold inputs. Wide tables scroll
 * sideways inside their card, never the page.
 *
 * ```tsx
 * <ItemsTable label="Quantities" rows={lines} getRowId={(line) => line.product}
 *   columns={[{ id: 'product', header: 'Product', cell: (line) => line.name }]} />
 * ```
 */
export function ItemsTable<Row>({
  label,
  columns,
  rows,
  getRowId,
  emptyText,
  rowTone,
  className,
}: ItemsTableProps<Row>) {
  return (
    <Table aria-label={label} className={className}>
      <TableHeader>
        <TableRow className="bg-table-head hover:bg-table-head">
          {columns.map((column) => (
            <TableHead
              key={column.id}
              className={cn(
                EDGE,
                'text-muted-foreground h-auto py-2 text-xs font-semibold tracking-wider uppercase',
                column.numeric && 'text-right',
              )}
            >
              {column.srOnlyHeader ? (
                <span className="sr-only">{column.header}</span>
              ) : (
                column.header
              )}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 && emptyText ? (
          <TableRow className="hover:bg-transparent">
            <TableCell
              colSpan={columns.length}
              className="text-muted-foreground px-4 py-6 text-center whitespace-normal"
            >
              {emptyText}
            </TableCell>
          </TableRow>
        ) : (
          rows.map((row) => (
            <TableRow
              key={getRowId(row)}
              className={cn('hover:bg-transparent', ROW_TONES[rowTone?.(row) ?? 'default'])}
            >
              {columns.map((column) => (
                <TableCell
                  key={column.id}
                  className={cn(
                    EDGE,
                    'py-2.5 align-top',
                    column.numeric && 'text-right tabular-nums',
                  )}
                >
                  {column.cell(row)}
                </TableCell>
              ))}
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
