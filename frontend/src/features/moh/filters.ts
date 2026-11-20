import type { WarehouseRequest } from '@/features/fulfilment/api';
import type { ListFilter } from '@/features/fulfilment/orderFilters';
import { isAwaitingWarehouse } from '@/features/fulfilment/status';

/** Paths of the MOH oversight screens. */
export const MOH_PATHS = {
  dashboard: '/moh',
  orders: '/moh/orders',
  requests: '/moh/orders/warehouse',
  order: (id: string) => `/moh/orders/${encodeURIComponent(id)}`,
} as const;

/** The warehouse request list's status filters, in the order they are shown. */
export const REQUEST_FILTERS = [
  { value: 'all', label: 'All', keeps: () => true },
  {
    value: 'waiting',
    label: 'With the warehouse',
    keeps: (request) => isAwaitingWarehouse(request.status),
  },
  {
    value: 'in_transit',
    label: 'In transit',
    keeps: (request) => request.status === 'dispatched',
  },
  { value: 'received', label: 'Received', keeps: (request) => request.status === 'received' },
] as const satisfies readonly ListFilter<WarehouseRequest>[];

/** A list's filters as they sit in its address. */
export interface ListParams {
  /** A filter value; `all` is left out of the address. */
  status?: string;
  /** A district name; null or left out for every district. */
  district?: string | null;
}

/** The address of a list with its filters, so a filtered view survives a refresh and can be shared. */
export function listHref(base: string, { status, district }: ListParams): string {
  const query = new URLSearchParams();
  if (status && status !== 'all') query.set('status', status);
  if (district) query.set('district', district);
  const search = query.toString();
  return search ? `${base}?${search}` : base;
}
