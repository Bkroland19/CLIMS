'use client';

import { DataTable, type DataTableColumn } from '@/components/data-table/DataTable';
import { formatSince, formatText, formatTimestamp } from '@/lib/format';

import type { Order, Rider } from './api';
import { alertsIn, formatQuantity } from './orders';
import { CappedListNotice, RecordLink } from './parts';
import { useDistrictNames, useOrders, useRiders } from './queries';
import { DCFP_PATHS } from './tasks';

const riderName = (riders: readonly Rider[] | undefined, id: string | null) => {
  const rider = riders?.find((candidate) => candidate.id === id);
  return rider ? `${rider.first_name} ${rider.last_name}`.trim() : 'A rider from your store';
};

/** Stock out with riders, and what they have delivered. */
export default function DeliveriesPage() {
  const dispatched = useOrders('dispatched');
  const delivered = useOrders('delivered');
  const riders = useRiders();
  const { names, isPending: namesPending, error: namesError, retry } = useDistrictNames();

  const hotspot: DataTableColumn<Order> = {
    id: 'hotspot',
    header: 'Hotspot',
    value: (alert) => names.hotspot(alert.hot_spot_id),
    cell: (alert) => (
      <RecordLink href={DCFP_PATHS.alert(alert.id)}>{names.hotspot(alert.hot_spot_id)}</RecordLink>
    ),
  };
  const sent: DataTableColumn<Order> = {
    id: 'sent',
    header: 'Sent',
    value: (alert) =>
      `${names.product(alert.condom_id)} ${formatQuantity(alert.quantity_issued, names.unit(alert.unit_of_measure_id))}`,
    cell: (alert) => (
      <div className="min-w-0">
        <div className="truncate">{names.product(alert.condom_id)}</div>
        <div className="text-muted-foreground truncate text-xs">
          {formatQuantity(alert.quantity_issued, names.unit(alert.unit_of_measure_id))}
        </div>
      </div>
    ),
  };
  const rider: DataTableColumn<Order> = {
    id: 'rider',
    header: 'Rider',
    value: (alert) => riderName(riders.data, alert.rider_id),
  };

  const outColumns: DataTableColumn<Order>[] = [
    hotspot,
    sent,
    rider,
    {
      id: 'since',
      header: 'Out since',
      value: (alert) => alert.updated_at,
      cell: (alert) => (
        <span title={formatTimestamp(alert.updated_at)}>{formatSince(alert.updated_at)}</span>
      ),
    },
  ];
  const deliveredColumns: DataTableColumn<Order>[] = [
    hotspot,
    sent,
    rider,
    {
      id: 'delivered',
      header: 'Delivered',
      value: (alert) => alert.updated_at,
      cell: (alert) => formatTimestamp(alert.updated_at),
    },
    {
      id: 'note',
      header: 'Delivery note',
      value: (alert) => alert.delivery_note,
      cell: (alert) => (
        <span className="line-clamp-2 max-w-80 whitespace-normal">
          {formatText(alert.delivery_note)}
        </span>
      ),
    },
  ];

  const ready = !namesPending && !riders.isPending;
  const retryAll = () => {
    for (const query of [dispatched, delivered, riders]) if (query.isError) void query.refetch();
    retry();
  };

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="deliveries-out" className="flex flex-col gap-3">
        <h2 id="deliveries-out" className="text-base font-semibold">
          With riders
        </h2>
        <DataTable
          label="With riders"
          columns={outColumns}
          rows={dispatched.data && ready ? alertsIn(dispatched.data.items) : undefined}
          getRowId={(alert) => alert.id}
          isLoading={dispatched.isPending || !ready}
          error={dispatched.error ?? namesError ?? riders.error}
          onRetry={retryAll}
          isRetrying={dispatched.isRefetching}
          emptyTitle="No stock is out with riders"
          emptyDescription="Stock you send from the district store waits here until the rider delivers it."
          defaultSort={{ columnId: 'since', direction: 'asc' }}
        />
      </section>

      <section aria-labelledby="deliveries-done" className="flex flex-col gap-3">
        <h2 id="deliveries-done" className="text-base font-semibold">
          Delivered
        </h2>
        {delivered.data ? (
          <CappedListNotice complete={delivered.data.complete} noun="deliveries" />
        ) : null}
        <DataTable
          label="Delivered"
          columns={deliveredColumns}
          rows={delivered.data && ready ? alertsIn(delivered.data.items) : undefined}
          getRowId={(alert) => alert.id}
          isLoading={delivered.isPending || !ready}
          error={delivered.error ?? namesError ?? riders.error}
          onRetry={retryAll}
          isRetrying={delivered.isRefetching}
          searchPlaceholder="Search deliveries…"
          emptyTitle="Nothing delivered yet"
          emptyDescription="Deliveries the riders confirm appear here, with their notes."
          defaultSort={{ columnId: 'delivered', direction: 'desc' }}
        />
      </section>
    </div>
  );
}
