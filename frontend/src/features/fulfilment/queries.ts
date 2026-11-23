import { useApiQuery } from '@/lib/api';

import { getDistrictStore, getOrder, listOrders, listRequests } from './api';

/*
 * The mock fulfilment data the remaining MOH and warehouse sample screens still read
 * (see ./api.ts). The DCFP's own screens use the Go API through `@/features/dcfp`.
 */
const ROOT = 'fulfilment';
export const fulfilmentKeys = {
  all: [ROOT] as const,
  orders: [ROOT, 'orders'] as const,
  order: (id: string) => [ROOT, 'orders', id] as const,
  requests: [ROOT, 'requests'] as const,
  store: [ROOT, 'store'] as const,
};

/** `enabled: false` holds the request back, e.g. for badge counts outside the DCFP workspace. */
interface ReadOptions {
  enabled?: boolean;
}

export function useOrders(options: ReadOptions = {}) {
  return useApiQuery(fulfilmentKeys.orders, listOrders, options);
}

export function useOrder(id: string) {
  return useApiQuery(fulfilmentKeys.order(id), (http, signal) => getOrder(http, id, signal));
}

export function useRequests(options: ReadOptions = {}) {
  return useApiQuery(fulfilmentKeys.requests, listRequests, options);
}

export function useDistrictStore(options: ReadOptions = {}) {
  return useApiQuery(fulfilmentKeys.store, getDistrictStore, options);
}
