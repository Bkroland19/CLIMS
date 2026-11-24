'use client';

import { Copy, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo } from 'react';

import { DataTable, type DataTableColumn } from '@/components/data-table/DataTable';
import { RowActions } from '@/components/data-table/RowActions';
import { FilterTabs } from '@/components/FilterTabs';
import { SampleDataNotice } from '@/components/SampleData';
import { StatusBadge } from '@/components/StatusBadge';
import type { HotspotOrder } from '@/features/fulfilment/api';
import { filterFrom, ORDER_FILTERS } from '@/features/fulfilment/orderFilters';
import { formatQuantities, totalPieces } from '@/features/fulfilment/products';
import { ORDER_STATUS } from '@/features/fulfilment/status';
import { EMPTY_VALUE, formatTimestamp } from '@/lib/format';

import { formatLeadTime, leadTimeMs } from './audit';
import { copyText } from '@/lib/copyText';
import { useDistrictContext } from '@/features/district/DistrictContext';
import { DistrictFilter } from './DistrictFilter';
import { listHref, MOH_PATHS } from './filters';
import { useNationalOrders } from './queries';

/** Every hotspot order in the country, filtered by status and district in the address. */
export default function MohOrdersPage() {
  const router = useRouter();
  const params = useSearchParams();
  const context = useDistrictContext();
  const district = context ? context.district : params.get('district') || null;
  const filter = filterFrom(ORDER_FILTERS, params.get('status'));
  const orders = useNationalOrders(district);

  const columns = useMemo<DataTableColumn<HotspotOrder>[]>(
    () => [
      {
        id: 'id',
        header: 'Order',
        value: (order) => order.id,
        cell: (order) => (
          <div className="min-w-0">
            <Link
              href={MOH_PATHS.order(order.id)}
              className="text-foreground font-medium underline-offset-4 hover:underline"
            >
              {order.id}
            </Link>
            <div className="text-muted-foreground text-xs">{formatTimestamp(order.created_at)}</div>
          </div>
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
              {[order.hotspot.district, order.hotspot.subcounty].filter(Boolean).join(' · ') ||
                EMPTY_VALUE}
            </div>
          </div>
        ),
      },
      {
        id: 'requested',
        header: 'Requested',
        value: (order) => totalPieces(order.requested),
        cell: (order) => formatQuantities(order.requested),
      },
      {
        id: 'received',
        header: 'Received at hotspot',
        value: (order) => (order.received_at ? totalPieces(order.approved) : null),
        cell: (order) => (order.received_at ? formatQuantities(order.approved) : EMPTY_VALUE),
      },
      {
        id: 'lead',
        header: 'Lead time',
        value: (order) => leadTimeMs(order),
        cell: (order) => formatLeadTime(order),
      },
      {
        id: 'status',
        filter: 'select',
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
  const isFiltered = filter.value !== 'all' || district !== null;

  return (
    <div className="gap-section flex flex-col">
      <SampleDataNotice subject="The orders" />
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <FilterTabs
          label="Filter orders by status"
          value={filter.value}
          hrefFor={(status) => listHref(MOH_PATHS.orders, { status, district })}
          tabs={ORDER_FILTERS.map((option) => ({
            value: option.value,
            label: option.label,
            ...(orders.data ? { count: orders.data.filter(option.keeps).length } : {}),
          }))}
        />
        {!context && (
          <DistrictFilter
            value={district}
            hrefFor={(next) => listHref(MOH_PATHS.orders, { status: filter.value, district: next })}
          />
        )}
      </div>
      <DataTable
        label="Hotspot orders"
        preferencesKey="moh-hotspot-orders"
        columns={columns}
        rows={rows}
        getRowId={(order) => order.id}
        isLoading={orders.isPending}
        error={orders.error}
        onRetry={() => void orders.refetch()}
        isRetrying={orders.isRefetching}
        searchPlaceholder="Search orders…"
        emptyTitle={isFiltered ? 'No orders in this view' : 'No hotspot orders yet'}
        emptyDescription={
          isFiltered
            ? 'Choose another status or district to see the rest of the orders.'
            : 'Stockout notifications from hotspots in every district appear here.'
        }
        rowActions={(order) => (
          <RowActions
            label={`Actions for ${order.id}`}
            actions={[
              {
                label: 'Open audit trail',
                icon: ShieldCheck,
                onSelect: () => {
                  router.push(MOH_PATHS.order(order.id));
                },
              },
              {
                label: 'Copy order ID',
                icon: Copy,
                onSelect: () => void copyText(order.id, 'order ID'),
              },
            ]}
          />
        )}
      />
    </div>
  );
}
