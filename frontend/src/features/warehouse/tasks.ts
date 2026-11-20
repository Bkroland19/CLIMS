import type { WarehouseRequest } from '@/features/fulfilment/api';
import { expiryOf, MIN_SHELF_MONTHS } from '@/features/fulfilment/batches';
import { formatQuantities } from '@/features/fulfilment/products';
import { REQUEST_STATUS } from '@/features/fulfilment/status';
import { formatNumber } from '@/lib/format';
import type { StatusTone } from '@/lib/status';

import type { WarehouseBatch } from './api';
import { BATCH_STATUS } from './dispatch';
import { WAREHOUSE_PATHS } from './paths';
import { isNew } from './progress';

/** The request list's filters, in the order they are shown. `status` in the address picks one. */
export const REQUEST_FILTERS = [
  { value: 'all', label: 'All', keeps: () => true },
  { value: 'new', label: 'New', keeps: isNew },
  { value: 'queued', label: 'Queued', keeps: (request) => request.status === 'queued' },
  { value: 'on_hold', label: 'On hold', keeps: (request) => request.status === 'on_hold' },
  { value: 'dispatched', label: 'In transit', keeps: (request) => request.status === 'dispatched' },
  { value: 'received', label: 'Received', keeps: (request) => request.status === 'received' },
] as const satisfies readonly {
  value: string;
  label: string;
  keeps: (request: WarehouseRequest) => boolean;
}[];

export type RequestFilter = (typeof REQUEST_FILTERS)[number];

export function requestFilterFrom(param: string | null): RequestFilter {
  return REQUEST_FILTERS.find((filter) => filter.value === param) ?? REQUEST_FILTERS[0];
}

export interface WarehouseTask {
  id: string;
  status: { label: string; tone: StatusTone };
  title: string;
  detail: string;
  action: string;
  /** A warehouse path without the store. */
  href: string;
}

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

/**
 * What needs the warehouse, in the order it needs doing: review new requests,
 * check and dispatch queued ones, re-check held ones, then deal with stock
 * that cannot go out (expired) or should go first (short shelf life).
 */
export function warehouseTasks(
  requests: readonly WarehouseRequest[],
  batches: readonly WarehouseBatch[],
  now: Date,
  formatTime: (iso: string) => string,
): WarehouseTask[] {
  const tasks: WarehouseTask[] = [];

  for (const request of requests.filter(isNew)) {
    tasks.push({
      id: `review-${request.id}`,
      status: REQUEST_STATUS[request.status],
      title: `Review ${request.id} from ${request.district}`,
      detail: `${formatQuantities(request.items)} · ${request.requested_by} · ${formatTime(request.created_at)}`,
      action: 'Review request',
      href: WAREHOUSE_PATHS.request(request.id),
    });
  }

  for (const request of requests.filter((candidate) => candidate.status === 'queued')) {
    tasks.push({
      id: `dispatch-${request.id}`,
      status: REQUEST_STATUS.queued,
      title: `Check stock and dispatch ${request.id} to ${request.district}`,
      detail: formatQuantities(request.items),
      action: 'Check stock',
      href: WAREHOUSE_PATHS.request(request.id),
    });
  }

  for (const request of requests.filter((candidate) => candidate.status === 'on_hold')) {
    tasks.push({
      id: `recheck-${request.id}`,
      status: REQUEST_STATUS.on_hold,
      title: `Re-check ${request.id} for ${request.district}`,
      detail: `${formatQuantities(request.items)} · ${request.hold_reason ?? 'On hold'}`,
      action: 'Re-check',
      href: WAREHOUSE_PATHS.request(request.id),
    });
  }

  const byState = (state: 'expired' | 'flagged') =>
    batches.filter((batch) => {
      const expiry = expiryOf(batch.expires_on, now).state;
      return state === 'expired' ? expiry === 'expired' : expiry === 'near' || expiry === 'short';
    });

  const expired = byState('expired');
  if (expired.length > 0) {
    const pieces = expired.reduce((sum, batch) => sum + batch.quantity, 0);
    tasks.push({
      id: 'expired',
      status: BATCH_STATUS.expired,
      title: `Remove ${String(expired.length)} expired ${plural(expired.length, 'batch', 'batches')} from stock`,
      detail: `${expired.map((batch) => batch.batch).join(', ')} · ${formatNumber(pieces)} pieces can't be dispatched`,
      action: 'View stock',
      href: WAREHOUSE_PATHS.stock,
    });
  }

  const flagged = byState('flagged');
  if (flagged.length > 0) {
    tasks.push({
      id: 'flagged',
      status: { label: 'Short shelf life', tone: 'caution' },
      title: `${String(flagged.length)} ${plural(flagged.length, 'batch has', 'batches have')} under ${String(MIN_SHELF_MONTHS)} months left`,
      detail: `${flagged.map((batch) => batch.batch).join(', ')} · districts are warned if these are dispatched`,
      action: 'View stock',
      href: WAREHOUSE_PATHS.stock,
    });
  }

  return tasks;
}

/** Pieces of each product asked for by requests the warehouse has not dispatched yet. */
export function reservedByOpenRequests(requests: readonly WarehouseRequest[]) {
  const open = requests.filter((request) => !['dispatched', 'received'].includes(request.status));
  return {
    male: open.reduce((sum, request) => sum + request.items.male, 0),
    female: open.reduce((sum, request) => sum + request.items.female, 0),
  };
}

/** Sidebar badge: requests waiting on the warehouse to review or dispatch them. */
export function warehouseCounts(
  requests: readonly WarehouseRequest[] | undefined,
): Record<string, number> {
  if (!requests) return {};
  return {
    [WAREHOUSE_PATHS.requests]: requests.filter(
      (request) => isNew(request) || request.status === 'queued',
    ).length,
  };
}
