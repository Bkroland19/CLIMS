import type { Hotspot } from '@/features/hotspots/api';

import type { Order, StockBalance } from './api';
import type { DistrictNames } from './names';
import {
  alertStatus,
  alertsIn,
  formatQuantity,
  requestStatus,
  requestsIn,
  sendableHeld,
  type StatusLabel,
} from './orders';

/** Paths of the DCFP screens a task or badge points at. */
export const DCFP_PATHS = {
  dashboard: '/dcfp',
  queue: '/dcfp/orders',
  held: '/dcfp/orders/held',
  alert: (id: string) => `/dcfp/orders/${encodeURIComponent(id)}`,
  requests: '/dcfp/restock',
  request: (id: string) => `/dcfp/restock/${encodeURIComponent(id)}`,
  store: '/dcfp/restock/store',
  deliveries: '/dcfp/dispatch',
  hotspots: '/dcfp/hotspots',
  hotspot: (id: string) => `/dcfp/hotspots/${encodeURIComponent(id)}`,
} as const;

export interface DcfpTask {
  id: string;
  status: StatusLabel;
  title: string;
  detail: string;
  action: string;
  href: string;
}

/**
 * The DCFP's open work, as read from the API. Each order list is one status
 * as `GET /orders?status=` returns it, alerts and requests mixed.
 */
export interface DcfpWork {
  queued?: readonly Order[];
  onHold?: readonly Order[];
  dispatched?: readonly Order[];
  stock?: readonly StockBalance[];
  /** Hotspots awaiting the DCFP's decision. */
  submitted?: readonly Pick<Hotspot, 'id' | 'name'>[];
}

const plural = (count: number, noun: string) => `${String(count)} ${noun}${count === 1 ? '' : 's'}`;

/** "A, B and C", or the first three and how many more. */
function listNames(names: readonly string[]): string {
  const shown = names.slice(0, 3);
  const more = names.length - shown.length;
  if (more > 0) return `${shown.join(', ')} and ${String(more)} more`;
  if (shown.length < 2) return shown.join('');
  return `${shown.slice(0, -1).join(', ')} and ${shown.at(-1) ?? ''}`;
}

const oldestFirst = (a: Order, b: Order) => a.created_at.localeCompare(b.created_at);

/**
 * What needs the DCFP, in the order it needs doing: decide on new alerts
 * (longest waiting first), send held alerts the store can now cover, receive
 * shipments that have arrived, and review submitted hotspots.
 */
export function dcfpTasks(
  work: DcfpWork,
  names: DistrictNames,
  formatTime: (iso: string | null) => string,
): DcfpTask[] {
  const tasks: DcfpTask[] = [];

  for (const alert of alertsIn(work.queued ?? []).sort(oldestFirst)) {
    tasks.push({
      id: `decide-${alert.id}`,
      status: alertStatus('queued'),
      title: `Stockout at ${names.hotspot(alert.hot_spot_id)}`,
      detail: `${names.product(alert.condom_id)} · reported ${formatTime(alert.created_at)}`,
      action: 'Decide',
      href: DCFP_PATHS.alert(alert.id),
    });
  }

  const ready = work.stock ? sendableHeld(work.onHold ?? [], work.stock) : [];
  if (ready.length > 0) {
    tasks.push({
      id: 'send-held',
      status: { label: 'Stock available', tone: 'positive' },
      title: `Send ${plural(ready.length, 'held alert')}`,
      detail: `${listNames(ready.map((alert) => names.hotspot(alert.hot_spot_id)))} can now be supplied from the district store`,
      action: 'Review held alerts',
      href: DCFP_PATHS.held,
    });
  }

  for (const request of requestsIn(work.dispatched ?? []).sort(oldestFirst)) {
    const quantity = formatQuantity(
      request.quantity_issued,
      names.unit(request.unit_of_measure_id),
    );
    tasks.push({
      id: `receive-${request.id}`,
      status: requestStatus('dispatched'),
      title: `Receive ${names.product(request.condom_id)} from ${names.store(request.ordered_from_store_id)}`,
      detail: `${quantity} · sent ${formatTime(request.updated_at)}`,
      action: 'Receive',
      href: DCFP_PATHS.request(request.id),
    });
  }

  const submitted = work.submitted ?? [];
  if (submitted.length > 0) {
    tasks.push({
      id: 'review-hotspots',
      status: { label: 'Submitted', tone: 'caution' },
      title: `Review ${plural(submitted.length, 'submitted hotspot')}`,
      detail: listNames(submitted.map((hotspot) => hotspot.name ?? 'Unnamed hotspot')),
      action: 'Review hotspots',
      href: DCFP_PATHS.hotspots,
    });
  }

  return tasks;
}

/**
 * Sidebar and tab badges: what waits on each DCFP page. A count is left out
 * while what it is counted from has not loaded.
 */
export function dcfpCounts(work: DcfpWork): Record<string, number> {
  const counts: Record<string, number> = {};
  if (work.queued) counts[DCFP_PATHS.queue] = alertsIn(work.queued).length;
  if (work.onHold && work.stock) {
    counts[DCFP_PATHS.held] = sendableHeld(work.onHold, work.stock).length;
  }
  if (work.dispatched) counts[DCFP_PATHS.requests] = requestsIn(work.dispatched).length;
  if (work.submitted) counts[DCFP_PATHS.hotspots] = work.submitted.length;
  return counts;
}
