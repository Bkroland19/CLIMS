'use client';

import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo } from 'react';

import { DataTable, type DataTableColumn } from '@/components/data-table/DataTable';
import { FilterSelect } from '@/components/FilterSelect';
import { PageActions } from '@/components/PageActions';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { WriteAction } from '@/components/WriteAction';
import { useDistrictContext } from '@/features/district/DistrictContext';
import { useStores } from '@/features/geography/queries';
import { EMPTY_VALUE, formatNumber, formatTimestamp } from '@/lib/format';

import type { Order, OrderStatus } from './api';
import {
  DCFP_PATHS,
  offeredQuantity,
  offerShortfall,
  orderLinks,
  ORDER_STATUS,
  warehouseOrders,
  type OrderScope,
} from './orders';
import { useNationalOrders } from './national';
import { useOrders } from './queries';
import { UNIT_PENDING, useOrderNames } from './useOrderNames';

/** Statuses no warehouse order takes: alert orders from before stockouts became reports, and others. */
const NOT_WAREHOUSE_ORDERS: ReadonlySet<OrderStatus> = new Set([
  'pending',
  'fulfilled',
  'delivered',
]);

/** The DCFP's orders to NMS and JMS, and the consignments waiting to be received. */
export default function WarehouseOrdersPage({ scope = 'district' }: { scope?: OrderScope }) {
  const links = orderLinks(scope);
  const national = links.national === true;
  const names = useOrderNames();
  // MOH's national list names each order's district store.
  const stores = useStores(national);
  const districtId = useDistrictContext()?.districtId ?? null;
  const storeName = useMemo(() => {
    const byId = new Map(
      (stores.data ?? []).map((store) => [store.id, store.district_name ?? store.name]),
    );
    return (id: string) => byId.get(id) ?? '';
  }, [stores.data]);
  const router = useRouter();
  const params = useSearchParams();
  // `?status=dispatched` (from "Receive warehouse delivery") opens the consignments to receive.
  const requested = params.get('status');
  const status =
    requested !== null && requested in ORDER_STATUS ? (requested as OrderStatus) : null;
  const search = params.get('q') ?? '';
  const listHref = (next: OrderStatus | null, q: string) => {
    const query = new URLSearchParams();
    if (next) query.set('status', next);
    if (q) query.set('q', q);
    const text = query.toString();
    return text ? `${links.list}?${text}` : links.list;
  };

  // A district's own orders load at once and filter here; MOH's national list asks the server for
  // one district (from the district menu), one status and the search, a page at a time.
  const local = useOrders({ enabled: !national });
  const remote = useNationalOrders({ districtId, status, search }, national);
  const orders = national
    ? {
        data: remote.data?.pages.flat(),
        isPending: remote.isPending,
        error: remote.error,
        refetch: remote.refetch,
        isRefetching: remote.isRefetching,
      }
    : local;
  const all = useMemo(() => {
    if (national) return orders.data;
    return orders.data && names.warehouses
      ? warehouseOrders(orders.data, names.warehouses)
      : undefined;
  }, [national, orders.data, names.warehouses]);
  const rows = useMemo(
    () => (!national && all && status ? all.filter((order) => order.order_status === status) : all),
    [national, all, status],
  );
  const statusOptions = useMemo(
    () => [
      { value: 'all', label: 'All statuses' },
      ...(Object.keys(ORDER_STATUS) as OrderStatus[])
        // The national list has not loaded every order, so it offers every warehouse-order status.
        .filter((value) =>
          national
            ? !NOT_WAREHOUSE_ORDERS.has(value)
            : value === status || all?.some((order) => order.order_status === value),
        )
        .map((value) => ({ value, label: ORDER_STATUS[value].label })),
    ],
    [national, all, status],
  );

  const columns = useMemo<DataTableColumn<Order>[]>(
    () => [
      {
        id: 'product',
        header: 'Product',
        value: (order) => names.product(order.condom_id, order.condom_category),
        cell: (order) => (
          <Link
            href={links.detail(order.id)}
            className="font-medium underline-offset-4 hover:underline"
          >
            {names.product(order.condom_id, order.condom_category)}
          </Link>
        ),
      },
      ...(links.national
        ? [
            {
              id: 'district',
              filter: 'select' as const,
              header: 'District',
              value: (order: Order) => storeName(order.ordered_for_store_id),
              cell: (order: Order) => storeName(order.ordered_for_store_id) || EMPTY_VALUE,
            },
          ]
        : []),
      {
        id: 'quantity',
        header: 'Quantity ordered',
        numeric: true,
        // Stock sent without an order carries the sent quantity here; nobody ordered it.
        value: (order) => (order.unrequested ? null : order.quantity_needed),
        cell: (order) =>
          order.unrequested ? (
            <span className="text-muted-foreground">Not ordered</span>
          ) : order.unit_of_measure_id === null && order.quantity_needed !== null ? (
            <>
              {formatNumber(order.quantity_needed)}{' '}
              <span className="text-muted-foreground">· {UNIT_PENDING}</span>
            </>
          ) : (
            names.quantity(order.quantity_needed, order.unit_of_measure_id)
          ),
      },
      {
        id: 'offered',
        header: 'Quantity offered',
        numeric: true,
        value: offeredQuantity,
        cell: (order) => {
          const offered = offeredQuantity(order);
          if (offered === null) {
            return <span className="text-muted-foreground">Not decided yet</span>;
          }
          if (order.order_status === 'rejected') {
            return <span className="text-muted-foreground">None</span>;
          }
          const short = offerShortfall(order);
          return (
            <>
              {names.quantity(offered, order.unit_of_measure_id)}
              {short === null ? null : (
                <span className="text-warning"> · {formatNumber(short)} short</span>
              )}
            </>
          );
        },
      },
      {
        id: 'warehouse',
        filter: 'select',
        header: 'Ordered from',
        value: (order) => names.warehouseLabel(order.ordered_from_store_id),
      },
      {
        id: 'ordered',
        filter: 'date',
        header: 'Ordered',
        value: (order) => order.created_at,
        cell: (order) => formatTimestamp(order.created_at),
      },
      {
        id: 'status',
        filter: 'select',
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
    [names, links, storeName],
  );

  const newOrder = links.national ? null : (
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
    <div className="gap-section flex flex-col">
      <PageActions>{newOrder}</PageActions>
      <DataTable
        label="Warehouse orders"
        preferencesKey="dcfp-warehouse-orders"
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
        searchPlaceholder={national ? 'Search district stores…' : 'Search orders…'}
        {...(national
          ? {
              serverSearch: {
                value: search,
                onChange: (q: string) => {
                  router.replace(listHref(status, q), { scroll: false });
                },
              },
              more: {
                hasMore: remote.hasNextPage,
                isLoading: remote.isFetchingNextPage,
                onLoadMore: () => void remote.fetchNextPage(),
                noun: 'orders',
              },
            }
          : {})}
        toolbar={
          <FilterSelect
            label="Status"
            value={status ?? 'all'}
            options={statusOptions}
            onValueChange={(next) => {
              router.replace(listHref(next === 'all' ? null : (next as OrderStatus), search), {
                scroll: false,
              });
            }}
          />
        }
        emptyTitle={status ? 'No orders with this status' : 'No warehouse orders yet'}
        emptyDescription={
          status
            ? 'Choose All statuses to see every order.'
            : 'Order condoms from NMS or JMS when the district store runs low or a hotspot reports a stockout.'
        }
        emptyAction={status ? undefined : newOrder}
        defaultSort={{ columnId: 'ordered', direction: 'desc' }}
      />
    </div>
  );
}
