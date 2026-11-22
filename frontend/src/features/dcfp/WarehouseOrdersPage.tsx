'use client';

import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';

import { DataTable, type DataTableColumn } from '@/components/data-table/DataTable';
import { PageActions } from '@/components/PageActions';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { WriteAction } from '@/components/WriteAction';
import { formatTimestamp } from '@/lib/format';

import type { Order } from './api';
import { DCFP_PATHS, ORDER_STATUS, warehouseOrders } from './orders';
import { useOrders } from './queries';
import { useOrderNames } from './useOrderNames';

/** The DCFP's orders to NMS and JMS, and the consignments waiting to be received. */
export default function WarehouseOrdersPage() {
  const orders = useOrders();
  const names = useOrderNames();

  const rows = useMemo(
    () =>
      orders.data && names.warehouses ? warehouseOrders(orders.data, names.warehouses) : undefined,
    [orders.data, names.warehouses],
  );

  const columns = useMemo<DataTableColumn<Order>[]>(
    () => [
      {
        id: 'product',
        header: 'Product',
        value: (order) => names.product(order.condom_id, order.condom_category),
        cell: (order) => (
          <Link
            href={DCFP_PATHS.order(order.id)}
            className="font-medium underline-offset-4 hover:underline"
          >
            {names.product(order.condom_id, order.condom_category)}
          </Link>
        ),
      },
      {
        id: 'quantity',
        header: 'Quantity ordered',
        numeric: true,
        value: (order) => order.quantity_needed,
        cell: (order) => names.quantity(order.quantity_needed, order.unit_of_measure_id),
      },
      {
        id: 'warehouse',
        header: 'Ordered from',
        value: (order) => names.warehouseLabel(order.ordered_from_store_id),
      },
      {
        id: 'ordered',
        header: 'Ordered',
        value: (order) => order.created_at,
        cell: (order) => formatTimestamp(order.created_at),
      },
      {
        id: 'status',
        header: 'Status',
        value: (order) => ORDER_STATUS[order.order_status].label,
        cell: (order) => (
          <StatusBadge
            status={ORDER_STATUS[order.order_status].label}
            tone={ORDER_STATUS[order.order_status].tone}
          />
        ),
      },
    ],
    [names],
  );

  const newOrder = (
    <WriteAction>
      <Button asChild>
        <Link href={DCFP_PATHS.newOrder}>
          <Plus data-icon="inline-start" />
          New order
        </Link>
      </Button>
    </WriteAction>
  );

  return (
    <div className="flex flex-col gap-4">
      <PageActions>{newOrder}</PageActions>
      <DataTable
        label="Warehouse orders"
        columns={columns}
        rows={rows}
        getRowId={(order) => order.id}
        isLoading={orders.isPending || names.isPending}
        error={orders.error ?? names.error}
        onRetry={() => {
          void orders.refetch();
          names.refetch();
        }}
        isRetrying={orders.isRefetching}
        searchPlaceholder="Search orders…"
        emptyTitle="No warehouse orders yet"
        emptyDescription="Order condoms from NMS or JMS when the district store runs low or a hotspot reports a stockout."
        emptyAction={newOrder}
        defaultSort={{ columnId: 'ordered', direction: 'desc' }}
      />
    </div>
  );
}
