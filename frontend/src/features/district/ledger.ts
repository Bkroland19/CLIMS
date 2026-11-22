import { MOVEMENT_REASONS, type MovementFilter, type MovementReason } from './api';
import { DCFP_PATHS } from './tasks';

/*
 * The district store ledger's filters, kept in the page address so a view
 * survives a refresh and can be shared:
 * `?reason=<reason>&from=YYYY-MM-DD&to=YYYY-MM-DD&page=<n>` (pages count from 1).
 */

/** How each kind of movement reads to the DCFP. */
export const REASON_LABELS: Record<MovementReason, string> = {
  opening: 'Opening balance',
  receipt: 'Receipt',
  adjustment: 'Adjustment',
  dispatch: 'Sent to a hotspot',
  order_receipt: 'From the warehouse',
};

const isDate = (value: string | null): value is string =>
  value !== null &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());

/** The ledger filter in an address; anything unreadable is left out. */
export function ledgerFilterFrom(params: URLSearchParams): MovementFilter {
  const reasonParam = params.get('reason');
  const reason = MOVEMENT_REASONS.find((candidate) => candidate === reasonParam) ?? null;
  const fromParam = params.get('from');
  const toParam = params.get('to');
  const from = isDate(fromParam) ? fromParam : null;
  // The API refuses a range that ends before it starts.
  const to = isDate(toParam) && (from === null || toParam >= from) ? toParam : null;
  const page = Number(params.get('page'));
  return { reason, from, to, page: Number.isInteger(page) && page > 1 ? page - 1 : 0 };
}

/** The store page's address for a ledger filter. */
export function ledgerHref(filter: MovementFilter): string {
  const params = new URLSearchParams();
  if (filter.reason) params.set('reason', filter.reason);
  if (filter.from) params.set('from', filter.from);
  if (filter.to) params.set('to', filter.to);
  if (filter.page > 0) params.set('page', String(filter.page + 1));
  const query = params.toString();
  return query ? `${DCFP_PATHS.store}?${query}` : DCFP_PATHS.store;
}

/** Where a movement's order is shown: stock sent for an alert, or received for a request. */
export function movementOrderHref(reason: MovementReason, orderId: string | null): string | null {
  if (orderId === null) return null;
  if (reason === 'dispatch') return DCFP_PATHS.alert(orderId);
  if (reason === 'order_receipt') return DCFP_PATHS.request(orderId);
  return null;
}

/** "+40", "−4" or "0": a change, signed in words as well as colour. */
export function signedChange(change: number, format: (value: number) => string): string {
  if (change === 0) return format(0);
  return `${change > 0 ? '+' : '−'}${format(Math.abs(change))}`;
}
