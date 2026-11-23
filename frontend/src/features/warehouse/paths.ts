import { WAREHOUSES, type WarehouseCode } from '@/features/fulfilment/api';

/*
 * Which warehouse the workspace is showing. NMS and JMS are stores, not
 * separate role areas (plan decision 2): every warehouse screen is the same
 * screen for either store, so the store rides in the address as `?store=`
 * rather than in the path. That keeps one set of routes and one navigation
 * entry per screen, and a link to a request still opens the right store.
 */

export const STORE_PARAM = 'store';

/** The store shown when the address names none and none is remembered. */
export const DEFAULT_STORE: WarehouseCode = 'NMS';

/** The short label in the store switch, as the prototype words it. */
export const STORE_LABELS: Record<WarehouseCode, string> = {
  NMS: 'NMS · Entebbe',
  JMS: 'JMS · Kampala',
};

/** A store code from the address or storage, or null when it is not one. */
export function parseStore(value: unknown): WarehouseCode | null {
  return WAREHOUSES.find((code) => code === value) ?? null;
}

/** `path` with the store added to its query, keeping any query it already has. */
export function withStore(path: string, store: WarehouseCode): string {
  const [pathname = '', query = ''] = path.split('?');
  const params = new URLSearchParams(query);
  params.set(STORE_PARAM, store);
  return `${pathname}?${params.toString()}`;
}

/** Paths of the warehouse screens, without the store; add it with {@link withStore}. */
export const WAREHOUSE_PATHS = {
  dashboard: '/warehouse',
  requests: '/warehouse/requests',
  requestsWithStatus: (status: string) =>
    `/warehouse/requests?status=${encodeURIComponent(status)}`,
  request: (id: string) => `/warehouse/requests/${encodeURIComponent(id)}`,
  stock: '/warehouse/stock',
  /** The stock page with the register-stock panel open. */
  register: '/warehouse/stock?register=1',
  /** The stock page with the dispatch-to-district panel open. */
  dispatch: '/warehouse/stock?dispatch=1',
  stockWithBand: (band: string) => `/warehouse/stock?band=${encodeURIComponent(band)}`,
} as const;
