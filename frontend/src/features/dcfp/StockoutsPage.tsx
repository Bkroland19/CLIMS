'use client';

import { PackagePlus, Truck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';

import { DataTable, type DataTableColumn } from '@/components/data-table/DataTable';
import { RowActions } from '@/components/data-table/RowActions';
import { StatusBadge } from '@/components/StatusBadge';
import { useCan } from '@/features/auth/queries';
import { useCurrentUser } from '@/features/auth/hooks';
import { EMPTY_VALUE, formatTimestamp } from '@/lib/format';
import { useReadOnly } from '@/navigation/useAccess';

import type { StockoutReport } from './api';
import { contactOf, DCFP_PATHS, placeOf, STOCKOUT_STATUS } from './orders';
import { useStockouts } from './queries';

/**
 * Stockout notifications from the district's hotspots: which hotspot, where, who to call, and
 * the hotspot's message. The DCFP can dispatch district stock or order from a warehouse.
 */
export default function StockoutsPage() {
  const reports = useStockouts();
  const router = useRouter();
  const readOnly = useReadOnly();
  const can = useCan();
  const storeId = useCurrentUser()?.store_id;

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
        id: 'status',
        filter: 'select',
        header: 'Status',
        value: (report) => STOCKOUT_STATUS[report.status ?? 'awaiting_supply'].label,
        cell: (report) => {
          const status = STOCKOUT_STATUS[report.status ?? 'awaiting_supply'];
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
        filter: 'date',
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
      preferencesKey="dcfp-stockouts"
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
                  ...(can('orders:supply_hotspots') &&
                  report.district_store_id === storeId &&
                  report.status !== 'fulfilled'
                    ? [
                        {
                          label: 'Dispatch to hotspot',
                          icon: Truck,
                          onSelect: () => {
                            router.push(DCFP_PATHS.dispatchFor(report.id));
                          },
                        },
                      ]
                    : []),
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
