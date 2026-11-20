import type { ActivityEntry } from '@/components/ActivityTimeline';
import type { DetailItem } from '@/components/DetailList';
import type { Activity, HotspotOrder } from '@/features/fulfilment/api';
import { historyOf, timelineEntries } from '@/features/fulfilment/activity';
import { formatQuantities } from '@/features/fulfilment/products';
import { EMPTY_VALUE, formatDuration, formatTimestamp } from '@/lib/format';

import type { OrderDetail } from './api';

const since = (from: string, to: string | Date): number =>
  new Date(to).getTime() - new Date(from).getTime();

/** Time from the stockout notification to confirmed receipt, or null while the order is open. */
export function leadTimeMs(order: Pick<HotspotOrder, 'created_at' | 'received_at'>): number | null {
  return order.received_at ? since(order.created_at, order.received_at) : null;
}

/** "3 h 20 min" for a closed order, "—" for an open one. */
export function formatLeadTime(order: Pick<HotspotOrder, 'created_at' | 'received_at'>): string {
  const lead = leadTimeMs(order);
  return lead === null ? EMPTY_VALUE : formatDuration(lead);
}

/** The headline figures of an order's audit page. */
export function orderMetrics({ order, held_at }: OrderDetail, now: Date): DetailItem[] {
  const lead = leadTimeMs(order);
  // A hold ends when the order is confirmed; one still on hold runs until now.
  const holdEnd =
    held_at && order.confirmed_at && since(held_at, order.confirmed_at) > 0
      ? order.confirmed_at
      : now;
  return [
    { label: 'Requested', value: formatQuantities(order.requested) },
    {
      label: 'Received at hotspot',
      value: order.received_at ? formatQuantities(order.approved) : EMPTY_VALUE,
    },
    {
      label: 'Lead time',
      value:
        lead === null
          ? `${formatDuration(since(order.created_at, now))} so far`
          : formatDuration(lead),
    },
    { label: 'Time on hold', value: held_at ? formatDuration(since(held_at, holdEnd)) : 'None' },
  ];
}

export interface OrderException {
  title: string;
  detail: string;
}

/** Anything on the order or its warehouse request that did not go as planned. */
export function orderExceptions({ warehouse_request: request }: OrderDetail): OrderException[] {
  const discrepancy = request?.receipt?.discrepancy;
  if (!request || !discrepancy) return [];
  return [{ title: `${request.id} · ${discrepancy.type}`, detail: discrepancy.note }];
}

/** The events on an order and its warehouse request, oldest first. */
export function trailOf({ order, warehouse_request: request, trail }: OrderDetail): Activity[] {
  return historyOf(trail, request ? [order.id, request.id] : [order.id]);
}

/**
 * An order's audit trail as timeline entries: who acted, in which role and
 * when, how long after the step before, and the warehouse request's ID on
 * the events that were about it rather than the order.
 */
export function auditEntries(detail: OrderDetail, now: Date): ActivityEntry[] {
  const events = trailOf(detail);
  // The shared mapping gives each entry its ID, text and role colour; the meta line is richer here.
  const entries = timelineEntries(events, { now });
  return events.map((event, index) => {
    const previous = index > 0 ? events[index - 1] : undefined;
    const reference = event.reference !== detail.order.id ? event.reference : null;
    const gap = previous
      ? `${formatDuration(since(previous.at, event.at))} after the last step`
      : null;
    return {
      id: event.id,
      text: event.text,
      role: entries[index]?.role ?? 'system',
      meta: [reference, event.actor, event.role_label, formatTimestamp(event.at, now), gap]
        .filter(Boolean)
        .join(' · '),
    };
  });
}

/** The newest order that is not yet closed, to trace on the dashboard. */
export function latestOpenOrder(orders: readonly HotspotOrder[]): HotspotOrder | null {
  return orders
    .filter((order) => order.status !== 'received')
    .reduce<HotspotOrder | null>(
      (latest, order) =>
        latest === null || since(latest.created_at, order.created_at) > 0 ? order : latest,
      null,
    );
}
