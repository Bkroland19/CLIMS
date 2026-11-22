'use client';

import { useSearchParams } from 'next/navigation';

import { DataTable, type DataTableColumn } from '@/components/data-table/DataTable';
import { FilterTabs } from '@/components/FilterTabs';
import { formatText, formatTimestamp } from '@/lib/format';

import type { Order, OrderStatus } from './api';
import { alertsIn, alertStatus } from './orders';
import { AlertStatusBadge, CappedListNotice, RecordLink } from './parts';
import { useDistrictNames, useOrders } from './queries';
import { DCFP_PATHS } from './tasks';

/** The statuses an alert passes through, as the queue's filters. */
const FILTERS = ['all', 'queued', 'on_hold', 'dispatched', 'delivered'] as const;
type Filter = (typeof FILTERS)[number];

const LABELS: Record<Filter, string> = {
  all: 'All',
  queued: alertStatus('queued').label,
  on_hold: alertStatus('on_hold').label,
  dispatched: alertStatus('dispatched').label,
  delivered: alertStatus('delivered').label,
};

const EMPTY: Record<Filter, { title: string; description: string }> = {
  all: {
    title: 'No stockout alerts yet',
    description: 'When a hotspot runs out, its alert appears here for you to act on.',
  },
  queued: {
    title: 'No new alerts',
    description: 'Every alert has been dealt with. New ones appear here.',
  },
  on_hold: {
    title: 'No alerts waiting for the warehouse',
    description: 'Alerts you ask the warehouse to restock for wait here until you send them.',
  },
  dispatched: {
    title: 'No alerts with a rider',
    description: 'Alerts you send from the district store wait here until they are delivered.',
  },
  delivered: {
    title: 'No deliveries yet',
    description: 'Alerts the riders have delivered appear here.',
  },
};

const filterFrom = (value: string | null): Filter =>
  FILTERS.find((filter) => filter === value) ?? 'all';

const hrefFor = (filter: Filter) =>
  filter === 'all' ? DCFP_PATHS.queue : `${DCFP_PATHS.queue}?status=${filter}`;

export default function AlertQueuePage() {
  const filter = filterFrom(useSearchParams().get('status'));
  const status: OrderStatus | null = filter === 'all' ? null : filter;
  const orders = useOrders(status);
  // The sidebar badges read these three already, so their counts cost nothing.
  const counted = {
    queued: useOrders('queued'),
    on_hold: useOrders('on_hold'),
    dispatched: useOrders('dispatched'),
  };
  const names = useDistrictNames();

  const columns: DataTableColumn<Order>[] = [
    {
      id: 'hotspot',
      header: 'Hotspot',
      value: (alert) => names.names.hotspot(alert.hot_spot_id),
      cell: (alert) => (
        <RecordLink href={DCFP_PATHS.alert(alert.id)}>
          {names.names.hotspot(alert.hot_spot_id)}
        </RecordLink>
      ),
    },
    { id: 'product', header: 'Product', value: (alert) => names.names.product(alert.condom_id) },
    {
      id: 'raised',
      header: 'Reported',
      value: (alert) => alert.created_at,
      cell: (alert) => formatTimestamp(alert.created_at),
    },
    {
      id: 'comment',
      header: 'Comment',
      value: (alert) => alert.comment,
      cell: (alert) => (
        <span className="line-clamp-2 max-w-80 whitespace-normal">{formatText(alert.comment)}</span>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      value: (alert) => alertStatus(alert.order_status).label,
      cell: (alert) => <AlertStatusBadge status={alert.order_status} />,
    },
  ];

  const countFor = (value: Filter): number | undefined => {
    if (value !== 'queued' && value !== 'on_hold' && value !== 'dispatched') return undefined;
    const items = counted[value].data?.items;
    return items ? alertsIn(items).length : undefined;
  };

  return (
    <div className="flex flex-col gap-4">
      <FilterTabs
        label="Filter alerts by status"
        value={filter}
        hrefFor={hrefFor}
        tabs={FILTERS.map((value) => {
          const count = countFor(value);
          return { value, label: LABELS[value], ...(count === undefined ? {} : { count }) };
        })}
      />
      {orders.data ? <CappedListNotice complete={orders.data.complete} noun="orders" /> : null}
      <DataTable
        // New alerts read oldest first, the rest newest first; a new filter starts its own order.
        key={filter}
        label="Stockout alerts"
        columns={columns}
        rows={orders.data && !names.isPending ? alertsIn(orders.data.items) : undefined}
        getRowId={(alert) => alert.id}
        isLoading={orders.isPending || names.isPending}
        error={orders.error ?? names.error}
        onRetry={() => {
          if (orders.isError) void orders.refetch();
          names.retry();
        }}
        isRetrying={orders.isRefetching}
        searchPlaceholder="Search alerts…"
        emptyTitle={EMPTY[filter].title}
        emptyDescription={EMPTY[filter].description}
        defaultSort={{ columnId: 'raised', direction: filter === 'queued' ? 'asc' : 'desc' }}
      />
    </div>
  );
}
