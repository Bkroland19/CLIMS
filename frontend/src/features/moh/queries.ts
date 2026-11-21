import { useApiQuery } from '@/lib/api';

import {
  getNationalOrder,
  getNationalSummary,
  listDistrictStores,
  listNationalActivity,
  listNationalOrders,
  listNationalRequests,
} from './api';

/* Read-only: MOH watches fulfilment across the country but does not act on it here. */
const ROOT = 'national';
export const nationalKeys = {
  all: [ROOT] as const,
  /** `district` is null for every district. */
  orders: (district: string | null) => [ROOT, 'orders', { district }] as const,
  order: (id: string) => [ROOT, 'order', id] as const,
  requests: (district: string | null) => [ROOT, 'requests', { district }] as const,
  summary: (district: string | null) => [ROOT, 'summary', district] as const,
  districtStores: [ROOT, 'district-stores'] as const,
  activity: (district: string | null) => [ROOT, 'activity', district] as const,
};

/** Hotspot orders in one district, or every district when `district` is null. */
export function useNationalOrders(district: string | null) {
  return useApiQuery(nationalKeys.orders(district), (http, signal) =>
    listNationalOrders(http, { district: district ?? undefined }, signal),
  );
}

/** One hotspot order with its warehouse request and full audit trail. */
export function useNationalOrder(id: string) {
  return useApiQuery(nationalKeys.order(id), (http, signal) => getNationalOrder(http, id, signal));
}

/** Warehouse requests from one district, or every district when `district` is null. */
export function useNationalRequests(district: string | null) {
  return useApiQuery(nationalKeys.requests(district), (http, signal) =>
    listNationalRequests(http, { district: district ?? undefined }, signal),
  );
}

export function useNationalSummary(district: string | null) {
  return useApiQuery(nationalKeys.summary(district), (http, signal) =>
    getNationalSummary(http, signal, { district: district ?? undefined }),
  );
}

export function useDistrictStores() {
  return useApiQuery(nationalKeys.districtStores, listDistrictStores);
}

export function useNationalActivity(district: string | null) {
  return useApiQuery(nationalKeys.activity(district), (http, signal) =>
    listNationalActivity(http, signal, { district: district ?? undefined }),
  );
}
