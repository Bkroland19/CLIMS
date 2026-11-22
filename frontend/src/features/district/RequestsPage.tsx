'use client';

import { useSearchParams } from 'next/navigation';

import { DataTable, type DataTableColumn } from '@/components/data-table/DataTable';
import { FilterTabs } from '@/components/FilterTabs';
import { formatNumber, formatTimestamp } from '@/lib/format';

import type { Order } from './api';
import { requestsIn, requestStatus } from './orders';
import { CappedListNotice, RecordLink, RequestStatusBadge } from './parts';
import { useDistrictNames, useOrders } from './queries';
import { DCFP_PATHS } from './tasks';

const FILTERS = ['all', 'open', 'dispatched', 'received'] as const;
type Filter = (typeof FILTERS)[number];

const TABS: Record<Filter, { label: string; keeps: (request: Order) => boolean }> = {
  all: { label: 'All', keeps: () => true },
  open: {
    label: 'With the warehouse',
    keeps: (request) => !['dispatched', 'received'].includes(request.order_status),
  },
  dispatched: {
    label: 'To receive',
    keeps: (request) => request.order_status === 'dispatched',
  },
  received: { label: 'Received', keeps: (request) => request.order_status === 'received' },
};

const filterFrom = (value: string | null): Filter =>
  FILTERS.find((filter) => filter === value) ?? 'all';

const hrefFor = (filter: Filter) =>
  filter === 'all' ? DCFP_PATHS.requests : `${DCFP_PATHS.requests}?status=${filter}`;

/** The district store's requests to the national warehouses, each made for one alert. */
export default function RequestsPage() {
  const filter = filterFrom(useSearchParams().get('status'));
  const orders = useOrders(null);
  const { names, isPending: namesPending, error: namesError, retry } = useDistrictNames();
  const all = orders.data?.items ?? [];
  const requests = requestsIn(all);
  const alertOf = (request: Order) => all.find((order) => order.id === request.parent_order_id);
  const unit = (request: Order) => names.unit(request.unit_of_measure_id) ?? '—';

  const columns: DataTableColumn<Order>[] = [
    {
      id: 'product',
      header: 'Product',
      value: (request) => names.product(request.condom_id),
      cell: (request) => (
        <RecordLink href={DCFP_PATHS.request(request.id)}>
          {names.product(request.condom_id)}
        </RecordLink>
      ),
    },
    {
      id: 'warehouse',
      header: 'Warehouse',
      value: (request) => names.store(request.ordered_from_store_id),
    },
    { id: 'unit', header: 'Unit', value: unit },
    {
      id: 'requested',
      header: 'Asked for',
      numeric: true,
      value: (request) => request.quantity_needed,
      cell: (request) => formatNumber(request.quantity_needed),
    },
    {
      id: 'issued',
      header: 'Sent',
      numeric: true,
      value: (request) => request.quantity_issued,
      cell: (request) => formatNumber(request.quantity_issued),
    },
    {
      id: 'hotspot',
      header: 'For hotspot',
      value: (request) => {
        const alert = alertOf(request);
        return alert ? names.hotspot(alert.hot_spot_id) : null;
      },
      cell: (request) => {
        const alert = alertOf(request);
        return alert ? (
          <RecordLink href={DCFP_PATHS.alert(alert.id)}>
            {names.hotspot(alert.hot_spot_id)}
          </RecordLink>
        ) : (
          '—'
        );
      },
    },
    {
      id: 'requested-at',
      header: 'Sent to warehouse',
      value: (request) => request.created_at,
      cell: (request) => formatTimestamp(request.created_at),
    },
    {
      id: 'status',
      header: 'Status',
      value: (request) => requestStatus(request.order_status).label,
      cell: (request) => <RequestStatusBadge status={request.order_status} />,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <FilterTabs
        label="Filter warehouse requests"
        value={filter}
        hrefFor={hrefFor}
        tabs={FILTERS.map((value) => ({
          value,
          label: TABS[value].label,
          ...(orders.data ? { count: requests.filter(TABS[value].keeps).length } : {}),
        }))}
      />
      {orders.data ? <CappedListNotice complete={orders.data.complete} noun="orders" /> : null}
      <DataTable
        label="Warehouse requests"
        columns={columns}
        rows={orders.data && !namesPending ? requests.filter(TABS[filter].keeps) : undefined}
        getRowId={(request) => request.id}
        isLoading={orders.isPending || namesPending}
        error={orders.error ?? namesError}
        onRetry={() => {
          if (orders.isError) void orders.refetch();
          retry();
        }}
        isRetrying={orders.isRefetching}
        searchPlaceholder="Search requests…"
        emptyTitle={filter === 'all' ? 'No warehouse requests yet' : 'No requests in this view'}
        emptyDescription={
          filter === 'all'
            ? 'Ask the warehouse for stock from a stockout alert you cannot cover from the district store.'
            : 'Choose another filter to see the rest of the requests.'
        }
        defaultSort={{ columnId: 'requested-at', direction: 'desc' }}
      />
    </div>
  );
}
