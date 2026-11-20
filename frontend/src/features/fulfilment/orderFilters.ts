import type { HotspotOrder } from './api';
import { isInDelivery } from './status';

/** One of a list's status filters: its value in the address, its tab label and the rows it keeps. */
export interface ListFilter<Row> {
  value: string;
  label: string;
  keeps: (row: Row) => boolean;
}

/**
 * The status filters of a hotspot order list (the DCFP queue and the MOH
 * order list), in the order they are shown. `status` in the address picks one.
 */
export const ORDER_FILTERS = [
  { value: 'all', label: 'All', keeps: () => true },
  { value: 'queued', label: 'In queue', keeps: (order) => order.status === 'queued' },
  { value: 'on_hold', label: 'On hold', keeps: (order) => order.status === 'on_hold' },
  { value: 'confirmed', label: 'Confirmed', keeps: (order) => order.status === 'confirmed' },
  { value: 'delivery', label: 'In delivery', keeps: (order) => isInDelivery(order.status) },
  { value: 'closed', label: 'Closed', keeps: (order) => order.status === 'received' },
] as const satisfies readonly ListFilter<HotspotOrder>[];

export type OrderFilterValue = (typeof ORDER_FILTERS)[number]['value'];

/** The filter named by the `status` in the address, or the first ("All") when it names none. */
export function filterFrom<Filters extends readonly [{ value: string }, ...{ value: string }[]]>(
  filters: Filters,
  param: string | null,
): Filters[number] {
  return filters.find((filter) => filter.value === param) ?? filters[0];
}
