'use client';

import { ArrowRight, Truck } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo } from 'react';

import { DataTable, type DataTableColumn } from '@/components/data-table/DataTable';
import { RowActions } from '@/components/data-table/RowActions';
import { FilterTabs } from '@/components/FilterTabs';
import { SampleDataNotice } from '@/components/SampleData';
import { StatusBadge } from '@/components/StatusBadge';
import { formatTimestamp } from '@/lib/format';

import type { HotspotOrder } from './api';
import { filterFrom, ORDER_FILTERS, type OrderFilterValue } from './orderFilters';
import { formatQuantities, totalPieces } from './products';
import { useOrders } from './queries';
import { ORDER_STATUS } from './status';
import { DCFP_PATHS, orderHref } from './tasks';

const hrefFor = (value: OrderFilterValue) =>
  value === 'all' ? DCFP_PATHS.queue : `${DCFP_PATHS.queue}?status=${value}`;

export default function OrderQueuePage() {
  const orders = useOrders();
  const router = useRouter();
  const filter = filterFrom(ORDER_FILTERS, useSearchParams().get('status'));

  const columns = useMemo<DataTableColumn<HotspotOrder>[]>(
    () => [
      {
        id: 'id',
        header: 'Order',
        value: (order) => order.id,
        cell: (order) => (
          <Link
            href={orderHref(order)}
            className="text-foreground font-medium underline-offset-4 hover:underline"
          >
            {order.id}
          </Link>
        ),
      },
      {
        id: 'hotspot',
        header: 'Hotspot',
        value: (order) => order.hotspot.name,
        cell: (order) => (
          <div className="min-w-0">
            <div className="truncate">{order.hotspot.name}</div>
            <div className="text-muted-foreground truncate text-xs">
              {order.hotspot.subcounty ?? '—'}
            </div>
          </div>
        ),
      },
      {
        id: 'by',
        header: 'Requested by',
        value: (order) => order.requested_by.name,
        cell: (order) => (
          <div className="min-w-0">
            <div className="truncate">{order.requested_by.name}</div>
            <div className="text-muted-foreground truncate text-xs">{order.requested_by.role}</div>
          </div>
        ),
      },
      {
        id: 'pieces',
        header: 'Pieces',
        value: (order) => totalPieces(order.requested),
        cell: (order) => formatQuantities(order.requested),
      },
      {
        id: 'received',
        header: 'Received',
        value: (order) => order.created_at,
        cell: (order) => formatTimestamp(order.created_at),
      },
      {
        id: 'status',
        header: 'Status',
        value: (order) => ORDER_STATUS[order.status].label,
        cell: (order) => (
          <StatusBadge
            status={ORDER_STATUS[order.status].label}
            tone={ORDER_STATUS[order.status].tone}
          />
        ),
      },
    ],
    [],
  );

  const rows = orders.data?.filter(filter.keeps);

  return (
    <div className="flex flex-col gap-4">
      <SampleDataNotice subject="The orders" />
      <FilterTabs
        label="Filter orders by status"
        value={filter.value}
        hrefFor={hrefFor}
        tabs={ORDER_FILTERS.map((option) => ({
          value: option.value,
          label: option.label,
          ...(orders.data ? { count: orders.data.filter(option.keeps).length } : {}),
        }))}
      />
      <DataTable
        label="Orders"
        columns={columns}
        rows={rows}
        getRowId={(order) => order.id}
        isLoading={orders.isPending}
        error={orders.error}
        onRetry={() => void orders.refetch()}
        isRetrying={orders.isRefetching}
        searchPlaceholder="Search orders…"
        emptyTitle={filter.value === 'all' ? 'No orders yet' : 'No orders in this view'}
        emptyDescription={
          filter.value === 'all'
            ? 'Stockout notifications from hotspots appear here.'
            : 'Choose another filter to see the rest of the orders.'
        }
        rowActions={(order) => (
          <RowActions
            label={`Actions for ${order.id}`}
            actions={[
              order.status === 'confirmed'
                ? {
                    label: 'Prepare dispatch',
                    icon: Truck,
                    onSelect: () => {
                      router.push(DCFP_PATHS.dispatchOrder(order.id));
                    },
                  }
                : {
                    label: order.status === 'queued' ? 'Review order' : 'Open order',
                    icon: ArrowRight,
                    onSelect: () => {
                      router.push(DCFP_PATHS.order(order.id));
                    },
                  },
            ]}
          />
        )}
      />
    </div>
  );
}
