import type { StatusTone } from '@/lib/status';

import type { HotspotOrder, OrderStatus, WarehouseRequest } from './api';
import { covers, formatQuantities, type Quantities } from './products';
import { ORDER_STATUS, REQUEST_STATUS } from './status';

/** Paths of the DCFP screens a task or badge points at. */
export const DCFP_PATHS = {
  dashboard: '/dcfp',
  queue: '/dcfp/orders',
  held: '/dcfp/orders/held',
  order: (id: string) => `/dcfp/orders/${encodeURIComponent(id)}`,
  requests: '/dcfp/restock',
  store: '/dcfp/restock/store',
  newRequest: '/dcfp/restock/new',
  newRequestFor: (orderId: string) => `/dcfp/restock/new?order=${encodeURIComponent(orderId)}`,
  request: (id: string) => `/dcfp/restock/${encodeURIComponent(id)}`,
  dispatch: '/dcfp/dispatch',
  dispatchOrder: (id: string) => `/dcfp/dispatch/${encodeURIComponent(id)}`,
  hotspots: '/dcfp/hotspots',
} as const;

/** Where an order's row leads: a confirmed order goes to its dispatch page, the rest to the order. */
export function orderHref(order: { id: string; status: OrderStatus }): string {
  return order.status === 'confirmed'
    ? DCFP_PATHS.dispatchOrder(order.id)
    : DCFP_PATHS.order(order.id);
}

export interface DcfpTask {
  id: string;
  status: { label: string; tone: StatusTone };
  title: string;
  detail: string;
  action: string;
  href: string;
}

/** Held orders the district store can now cover in full. */
export function releasable(orders: readonly HotspotOrder[], stock: Quantities): HotspotOrder[] {
  return orders.filter((order) => order.status === 'on_hold' && covers(stock, order.approved));
}

/**
 * What needs the DCFP, in the order it needs doing: review new orders,
 * request stock for held orders, receive what has arrived, release what can
 * now be covered, dispatch what is confirmed.
 */
export function dcfpTasks(
  orders: readonly HotspotOrder[],
  requests: readonly WarehouseRequest[],
  stock: Quantities,
  formatTime: (iso: string | null) => string,
): DcfpTask[] {
  const tasks: DcfpTask[] = [];

  for (const order of orders.filter((candidate) => candidate.status === 'queued')) {
    tasks.push({
      id: `review-${order.id}`,
      status: ORDER_STATUS.queued,
      title: `Review ${order.id} from ${order.hotspot.name}`,
      detail: `${formatQuantities(order.requested)} · ${order.reason} · ${formatTime(order.created_at)}`,
      action: 'Review order',
      href: DCFP_PATHS.order(order.id),
    });
  }

  const unrequested = orders.filter(
    (order) =>
      order.status === 'on_hold' && !order.warehouse_request_id && !covers(stock, order.approved),
  );
  const [firstUnrequested] = unrequested;
  if (firstUnrequested) {
    const plural = unrequested.length > 1 ? 's' : '';
    tasks.push({
      id: 'request-stock',
      status: ORDER_STATUS.on_hold,
      title: `Request stock for ${String(unrequested.length)} held order${plural}`,
      detail: `${unrequested.map((order) => order.id).join(', ')} · no warehouse request yet`,
      action: 'Request stock',
      href: DCFP_PATHS.newRequestFor(firstUnrequested.id),
    });
  }

  for (const request of requests.filter((candidate) => candidate.status === 'dispatched')) {
    tasks.push({
      id: `receive-${request.id}`,
      status: REQUEST_STATUS.dispatched,
      title: `Receive ${request.id} from ${request.warehouse}`,
      detail: request.dispatch
        ? `${formatQuantities(request.dispatch.items)} · waybill ${request.dispatch.waybill}`
        : formatQuantities(request.items),
      action: 'Receive stock',
      href: DCFP_PATHS.request(request.id),
    });
  }

  const ready = releasable(orders, stock);
  if (ready.length > 0) {
    const plural = ready.length > 1 ? 's' : '';
    tasks.push({
      id: 'release',
      status: { label: 'Stock available', tone: 'positive' },
      title: `Release ${String(ready.length)} held order${plural}`,
      detail: `${ready.map((order) => order.id).join(', ')} can now be fulfilled from the district store`,
      action: 'Review held orders',
      href: DCFP_PATHS.held,
    });
  }

  for (const order of orders.filter((candidate) => candidate.status === 'confirmed')) {
    tasks.push({
      id: `dispatch-${order.id}`,
      status: ORDER_STATUS.confirmed,
      title: `Dispatch ${order.id} to ${order.hotspot.name}`,
      detail: `${formatQuantities(order.approved)} · confirmed ${formatTime(order.confirmed_at)}`,
      action: 'Prepare dispatch',
      href: DCFP_PATHS.dispatchOrder(order.id),
    });
  }

  return tasks;
}

/** Sidebar and tab badges: what is waiting on each DCFP page. */
export function dcfpCounts(
  orders: readonly HotspotOrder[] | undefined,
  requests: readonly WarehouseRequest[] | undefined,
  stock: Quantities | undefined,
): Record<string, number> {
  const counts: Record<string, number> = {};
  if (orders) {
    counts[DCFP_PATHS.queue] = orders.filter((order) => order.status === 'queued').length;
    counts[DCFP_PATHS.dispatch] = orders.filter((order) => order.status === 'confirmed').length;
    if (stock) counts[DCFP_PATHS.held] = releasable(orders, stock).length;
  }
  if (requests) {
    counts[DCFP_PATHS.requests] = requests.filter(
      (request) => request.status === 'dispatched',
    ).length;
  }
  return counts;
}
