'use client';

import { Download, FileSpreadsheet } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';

import { DataTable, type DataTableColumn } from '@/components/data-table/DataTable';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { getErrorMessage, useHttp } from '@/lib/api';
import { formatTimestamp } from '@/lib/format';

import type { ReportCell, ReportTable } from './api';
import { displayCell, downloadCsv, downloadExcel } from './files';

type Row = Readonly<Record<string, ReportCell>> & { readonly __index: number };

/** Period, data update time, scope and product: what the figures cover (RF05, RF15). */
export function ReportMeta({ table }: { table: ReportTable }) {
  return (
    <dl className="text-muted-foreground flex flex-wrap gap-x-5 gap-y-1 text-sm">
      {(
        [
          ['Period', table.period],
          ['Data updated', formatTimestamp(table.data_updated_at)],
          ['Scope', table.scope],
          ['Product', table.product],
        ] as const
      ).map(([label, value]) => (
        <div key={label} className="flex gap-1.5">
          <dt>{label}:</dt>
          <dd className="text-foreground font-medium">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Downloads: the server's CSV of `csvPath`, and an Excel file built from the same table. */
export function DownloadButtons({
  table,
  csvPath,
}: {
  table: ReportTable | undefined;
  csvPath: string;
}) {
  const http = useHttp();
  const [busy, setBusy] = useState<'csv' | 'excel' | null>(null);
  const run = async (kind: 'csv' | 'excel') => {
    if (!table) return;
    setBusy(kind);
    try {
      await (kind === 'csv' ? downloadCsv(http, csvPath, table.title) : downloadExcel(table));
    } catch (error) {
      toast.error(
        `The ${kind === 'csv' ? 'CSV' : 'Excel'} file could not be created: ${getErrorMessage(error)}`,
      );
    } finally {
      setBusy(null);
    }
  };
  return (
    <>
      <Button variant="outline" disabled={!table || busy !== null} onClick={() => void run('csv')}>
        {busy === 'csv' ? (
          <Spinner data-icon="inline-start" aria-hidden="true" />
        ) : (
          <Download data-icon="inline-start" />
        )}
        Download CSV
      </Button>
      <Button
        variant="outline"
        disabled={!table || busy !== null}
        onClick={() => void run('excel')}
      >
        {busy === 'excel' ? (
          <Spinner data-icon="inline-start" aria-hidden="true" />
        ) : (
          <FileSpreadsheet data-icon="inline-start" />
        )}
        Export Excel
      </Button>
    </>
  );
}

interface ReportTableViewProps {
  table: ReportTable | undefined;
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
  isRetrying: boolean;
  toolbar?: ReactNode;
}

/**
 * The report's rows with the server's own columns and headers, so the screen
 * shows exactly what the downloads contain. Blank cells show "—", never 0.
 */
export function ReportTableView({
  table,
  isLoading,
  error,
  onRetry,
  isRetrying,
  toolbar,
}: ReportTableViewProps) {
  const columns = useMemo<DataTableColumn<Row>[]>(
    () =>
      (table?.columns ?? []).map(({ key, header }) => ({
        id: key,
        header,
        filter: /(_at|_date)$/.test(key)
          ? 'date'
          : ['status', 'category', 'source', 'district', 'unit', 'warehouse'].includes(key)
            ? 'select'
            : undefined,
        value: (row) => {
          const value = row[key] ?? null;
          return typeof value === 'number'
            ? value
            : value === null
              ? null
              : /(_at|_date)$/.test(key)
                ? String(value)
                : displayCell(key, value);
        },
        cell: (row) => displayCell(key, row[key] ?? null),
        numeric: table?.rows.some((row) => typeof row[key] === 'number') ?? false,
      })),
    [table],
  );
  const rows = useMemo(
    () => table?.rows.map((row, index) => ({ ...row, __index: index })),
    [table],
  );

  return (
    <div className="flex flex-col gap-3">
      <DataTable
        label={table?.title ?? 'Report'}
        columns={columns}
        rows={rows}
        getRowId={(row) => row.__index}
        isLoading={isLoading}
        error={error}
        onRetry={onRetry}
        isRetrying={isRetrying}
        searchPlaceholder="Search rows…"
        emptyTitle="No records for these filters"
        emptyDescription="Nothing matches this period, area and product. This is a genuine zero, not missing data."
        toolbar={toolbar}
      />
      {table ? (
        <details className="text-muted-foreground text-sm">
          <summary className="cursor-pointer font-medium">Definitions</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {table.definitions.map((text) => (
              <li key={text}>{text}</li>
            ))}
            <li>Rule version: {table.rule_version}</li>
          </ul>
        </details>
      ) : null}
    </div>
  );
}
