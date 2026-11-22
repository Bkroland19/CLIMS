'use client';

import Link from 'next/link';

import { DataTable, type DataTableColumn } from '@/components/data-table/DataTable';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { WriteAction } from '@/components/WriteAction';
import { formatNumber, formatTimestamp } from '@/lib/format';

import type { Order } from './api';
import { alertsIn, availableFor, requestFor, requestStatus } from './orders';
import { CappedListNotice, RecordLink, RequestStatusBadge } from './parts';
import { useDistrictNames, useOrders, useStock } from './queries';
import { DCFP_PATHS } from './tasks';

/**
 * Alerts waiting for the warehouse, each with where its request stands and
 * what the district store can send of its product now. Those the store can
 * cover come first, with "Send now".
 */
export default function HeldAlertsPage() {
  const held = useOrders('on_hold');
  // Requests in every status: a held alert's request may be anywhere from sent to received.
  const all = useOrders(null);
  const stock = useStock();
  const { names, isPending: namesPending, error: namesError, retry } = useDistrictNames();

  const requests = all.data?.items ?? [];
  const available = (alert: Order) => availableFor(stock.data ?? [], alert.condom_id);

  const columns: DataTableColumn<Order>[] = [
    {
      id: 'hotspot',
      header: 'Hotspot',
      value: (alert) => names.hotspot(alert.hot_spot_id),
      cell: (alert) => (
        <RecordLink href={DCFP_PATHS.alert(alert.id)}>
          {names.hotspot(alert.hot_spot_id)}
        </RecordLink>
      ),
    },
    { id: 'product', header: 'Product', value: (alert) => names.product(alert.condom_id) },
    {
      id: 'reported',
      header: 'Reported',
      value: (alert) => alert.created_at,
      cell: (alert) => formatTimestamp(alert.created_at),
    },
    {
      id: 'request',
      header: 'Warehouse request',
      value: (alert) => {
        const request = requestFor(alert.id, requests);
        return request ? requestStatus(request.order_status).label : null;
      },
      cell: (alert) => {
        const request = requestFor(alert.id, requests);
        if (!request) return '—';
        return (
          <div className="flex min-w-0 flex-col items-start gap-1">
            <RequestStatusBadge status={request.order_status} />
            <Link
              href={DCFP_PATHS.request(request.id)}
              className="text-muted-foreground truncate text-xs underline-offset-4 hover:underline"
            >
              {names.store(request.ordered_from_store_id)}
            </Link>
          </div>
        );
      },
    },
    {
      id: 'available',
      header: 'Available in store',
      numeric: true,
      value: available,
      cell: (alert) => {
        const count = available(alert);
        return count > 0 ? (
          <span className="font-medium">{formatNumber(count)}</span>
        ) : (
          <StatusBadge status="None" tone="caution" />
        );
      },
    },
  ];

  const rows =
    held.data && stock.data && all.data && !namesPending ? alertsIn(held.data.items) : undefined;

  return (
    <div className="flex flex-col gap-4">
      {held.data ? <CappedListNotice complete={held.data.complete} noun="held orders" /> : null}
      <DataTable
        label="Alerts waiting for the warehouse"
        columns={columns}
        rows={rows}
        getRowId={(alert) => alert.id}
        isLoading={held.isPending || stock.isPending || all.isPending || namesPending}
        error={held.error ?? stock.error ?? all.error ?? namesError}
        onRetry={() => {
          for (const query of [held, stock, all]) if (query.isError) void query.refetch();
          retry();
        }}
        isRetrying={held.isRefetching || stock.isRefetching || all.isRefetching}
        searchPlaceholder="Search held alerts…"
        emptyTitle="No alerts waiting for the warehouse"
        emptyDescription="When you ask the warehouse to restock for an alert, it waits here until you send it."
        defaultSort={{ columnId: 'available', direction: 'desc' }}
        rowActions={(alert) =>
          available(alert) > 0 ? (
            <WriteAction>
              <Button asChild size="sm">
                <Link
                  href={DCFP_PATHS.alert(alert.id)}
                  aria-label={`Send now to ${names.hotspot(alert.hot_spot_id)}`}
                >
                  Send now
                </Link>
              </Button>
            </WriteAction>
          ) : null
        }
      />
    </div>
  );
}
