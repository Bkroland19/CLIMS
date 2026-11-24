import { useInfiniteQuery } from '@tanstack/react-query';

import { orderSchema, type Order, type OrderStatus } from '@/features/orders/api';
import { parseList, useHttp, type ApiError, type HttpClient } from '@/lib/api';

import { stockoutReportSchema, type StockoutReport } from './api';
import type { StockoutFilter } from './orders';

/*
 * MOH's national Orders lists read every district, so they page on the server rather than load the
 * country into the browser (docs/modules/orders.md):
 *
 *   GET /orders/stockouts?district_id=&status=a,b&q=&limit=&offset=
 *   GET /orders?type=warehouse_request&district_id=&status=&q=&limit=&offset=
 *
 * The district comes from the MOH district menu, the status from the list's tab and `q` from its
 * search box, which searches the whole country rather than the rows already loaded.
 */

export const NATIONAL_PAGE_SIZE = 50;

/** The statuses a stockout tab asks the server for; none for every request. */
const STOCKOUT_STATUSES: Record<StockoutFilter, readonly string[]> = {
  all: [],
  open: ['awaiting_supply', 'awaiting_acknowledgement', 'partly_received'],
  awaiting_supply: ['awaiting_supply'],
  awaiting_acknowledgement: ['awaiting_acknowledgement'],
  partly_received: ['partly_received'],
  fulfilled: ['fulfilled'],
  rejected: ['rejected'],
};

export interface NationalStockoutFilters {
  districtId: string | null;
  filter: StockoutFilter;
  search: string;
}

export interface NationalOrderFilters {
  districtId: string | null;
  status: OrderStatus | null;
  search: string;
}

function query(params: Record<string, string | null | readonly string[]>, offset: number): string {
  const out = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const text = Array.isArray(value) ? value.join(',') : value;
    if (text) out.set(key, text as string);
  }
  out.set('limit', String(NATIONAL_PAGE_SIZE));
  if (offset > 0) out.set('offset', String(offset));
  return out.toString();
}

export async function listNationalStockouts(
  http: HttpClient,
  filters: NationalStockoutFilters,
  offset: number,
  signal?: AbortSignal,
): Promise<StockoutReport[]> {
  const params = query(
    {
      district_id: filters.districtId,
      status: STOCKOUT_STATUSES[filters.filter],
      q: filters.search,
    },
    offset,
  );
  return parseList(
    stockoutReportSchema,
    await http.get(`/orders/stockouts?${params}`, { signal }),
    'stockout requests',
  );
}

export async function listNationalOrders(
  http: HttpClient,
  filters: NationalOrderFilters,
  offset: number,
  signal?: AbortSignal,
): Promise<Order[]> {
  const params = query(
    {
      type: 'warehouse_request',
      district_id: filters.districtId,
      status: filters.status,
      q: filters.search,
    },
    offset,
  );
  return parseList(
    orderSchema,
    await http.get(`/orders?${params}`, { signal }),
    'warehouse orders',
  );
}

export const nationalOrderKeys = {
  stockouts: (filters: NationalStockoutFilters) =>
    ['national-orders', 'stockouts', filters] as const,
  orders: (filters: NationalOrderFilters) => ['national-orders', 'orders', filters] as const,
};

/** A short page is the last one; the API gives no total. */
const nextOffset = (last: readonly unknown[], pages: readonly unknown[]) =>
  last.length < NATIONAL_PAGE_SIZE ? undefined : pages.length * NATIONAL_PAGE_SIZE;

const pageOf = (pageParam: unknown) => (typeof pageParam === 'number' ? pageParam : 0);

/** Every district's stockout requests a page at a time; only when `enabled` (national scope). */
export function useNationalStockouts(filters: NationalStockoutFilters, enabled: boolean) {
  const http = useHttp();
  // `http` is the provider's one client, so it is not part of the key.
  // eslint-disable-next-line @tanstack/query/exhaustive-deps
  return useInfiniteQuery<StockoutReport[], ApiError>({
    queryKey: nationalOrderKeys.stockouts(filters),
    queryFn: ({ pageParam, signal }) =>
      listNationalStockouts(http, filters, pageOf(pageParam), signal),
    initialPageParam: 0,
    getNextPageParam: nextOffset,
    enabled,
  });
}

/** Every district's orders to NMS and JMS a page at a time; only when `enabled`. */
export function useNationalOrders(filters: NationalOrderFilters, enabled: boolean) {
  const http = useHttp();
  // eslint-disable-next-line @tanstack/query/exhaustive-deps
  return useInfiniteQuery<Order[], ApiError>({
    queryKey: nationalOrderKeys.orders(filters),
    queryFn: ({ pageParam, signal }) =>
      listNationalOrders(http, filters, pageOf(pageParam), signal),
    initialPageParam: 0,
    getNextPageParam: nextOffset,
    enabled,
  });
}
