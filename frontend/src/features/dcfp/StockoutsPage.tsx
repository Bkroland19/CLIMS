'use client';

import { PackagePlus, Truck } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';

import { DataTable, type DataTableColumn } from '@/components/data-table/DataTable';
import { RowActions } from '@/components/data-table/RowActions';
import { StatusBadge } from '@/components/StatusBadge';
import { EMPTY_VALUE, formatTimestamp } from '@/lib/format';
import { useReadOnly } from '@/navigation/useAccess';

import type { StockoutReport } from './api';
import { contactOf, DCFP_PATHS, placeOf } from './orders';
import { useStockouts } from './queries';
import { STOCKOUT_STATUS } from './stockouts';

/**
 * Stockout notifications from the district's hotspots: which hotspot, where, who to call, the
 * hotspot's message and how far fulfilment has got. A report is not an order: the DCFP sends
 * stock from the district store (the report's page), or orders from NMS or JMS when the store
 * is short.
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
            <Link
              href={DCFP_PATHS.stockout(report.id)}
              className="font-medium underline-offset-4 hover:underline"
            >
              {report.hot_spot.name}
            </Link>
            <div className="text-muted-foreground truncate text-xs">
              {placeOf(report) || EMPTY_VALUE}
            </div>
          </div>
        ),
      },
      { id: 'product', header: 'Out of', value: (report) => report.product },
      {
        id: 'status',
        header: 'Status',
        value: (report) => STOCKOUT_STATUS[report.status].label,
        cell: (report) => {
          const status = STOCKOUT_STATUS[report.status];
          return <StatusBadge status={status.label} tone={status.tone} />;
        },
      },
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
                  ...(report.status === 'fulfilled'
                    ? []
                    : [
                        {
                          label: 'Send stock to the hotspot',
                          icon: Truck,
                          onSelect: () => {
                            router.push(DCFP_PATHS.stockout(report.id));
                          },
                        },
                      ]),
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
