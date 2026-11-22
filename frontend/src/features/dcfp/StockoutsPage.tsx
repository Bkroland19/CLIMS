'use client';

import { PackagePlus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';

import { DataTable, type DataTableColumn } from '@/components/data-table/DataTable';
import { RowActions } from '@/components/data-table/RowActions';
import { EMPTY_VALUE, formatTimestamp } from '@/lib/format';
import { useReadOnly } from '@/navigation/useAccess';

import type { StockoutReport } from './api';
import { contactOf, DCFP_PATHS, placeOf } from './orders';
import { useStockouts } from './queries';

/**
 * Stockout notifications from the district's hotspots: which hotspot, where, who to call, and
 * the hotspot's message. A report is not an order; the DCFP decides whether to order stock
 * from NMS or JMS, and the row action starts that order with the product chosen.
 */
export default function StockoutsPage() {
  const reports = useStockouts();
  const router = useRouter();
  const readOnly = useReadOnly();

  const columns = useMemo<DataTableColumn<StockoutReport>[]>(
    () => [
      {
        id: 'hotspot',
        header: 'Hotspot',
        value: (report) => `${report.hot_spot.name} ${placeOf(report)}`,
        cell: (report) => (
          <div className="min-w-0">
            <div className="font-medium">{report.hot_spot.name}</div>
            <div className="text-muted-foreground truncate text-xs">
              {placeOf(report) || EMPTY_VALUE}
            </div>
          </div>
        ),
      },
      { id: 'product', header: 'Out of', value: (report) => report.product },
      {
        id: 'message',
        header: 'Message',
        value: (report) => report.comment ?? '',
        cell: (report) =>
          report.comment ? (
            <span className="line-clamp-2 max-w-80 whitespace-normal">{report.comment}</span>
          ) : (
            <span className="text-muted-foreground">No message</span>
          ),
      },
      {
        id: 'contact',
        header: 'Contact',
        value: (report) => contactOf(report),
        cell: (report) => contactOf(report) || EMPTY_VALUE,
      },
      { id: 'reporter', header: 'Reported by', value: (report) => report.reported_by },
      {
        id: 'reported',
        header: 'Reported',
        value: (report) => report.created_at,
        cell: (report) => formatTimestamp(report.created_at),
      },
    ],
    [],
  );

  return (
    <DataTable
      label="Stockout notifications"
      columns={columns}
      rows={reports.data}
      getRowId={(report) => report.id}
      isLoading={reports.isPending}
      error={reports.error}
      onRetry={() => void reports.refetch()}
      isRetrying={reports.isRefetching}
      searchPlaceholder="Search hotspots, products, messages…"
      emptyTitle="No stockouts reported"
      emptyDescription="When a hotspot in your district runs out, its report appears here and in your notifications."
      rowActions={
        readOnly
          ? undefined
          : (report) => (
              <RowActions
                label={`Actions for ${report.hot_spot.name}`}
                actions={[
                  {
                    label: 'Order stock from a warehouse',
                    icon: PackagePlus,
                    onSelect: () => {
                      router.push(DCFP_PATHS.newOrderFor(report.selection));
                    },
                  },
                ]}
              />
            )
      }
    />
  );
}
