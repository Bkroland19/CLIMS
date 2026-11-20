import type { Step } from '@/components/StepTracker';
import { formatTimestamp } from '@/lib/format';

import type { HotspotOrder, WarehouseRequest } from './api';
import { isAwaitingWarehouse, isInDelivery } from './status';

/** The result of the DCFP's stock check on the order page, before it is confirmed or held. */
export type CheckResult = 'available' | 'short' | null;

/**
 * A hotspot order's progress, from the stockout notification to receipt at
 * the hotspot. `check` is the stock check made on the review page; it only
 * matters while the order is still in the queue.
 */
export function orderSteps(order: HotspotOrder, check: CheckResult, now?: Date): Step[] {
  const { status } = order;
  const inQueue = status === 'queued';
  const checked = inQueue && check !== null;
  const afterDispatch = isInDelivery(status) || status === 'received';

  const decision: Step =
    status === 'on_hold'
      ? { id: 'decision', label: 'On hold', detail: 'Waiting for stock', state: 'attention' }
      : inQueue
        ? { id: 'decision', label: 'Confirm or hold', state: checked ? 'current' : 'upcoming' }
        : {
            id: 'decision',
            label: 'Confirmed',
            detail: formatTimestamp(order.confirmed_at, now),
            state: 'done',
          };

  return [
    {
      id: 'queued',
      label: 'Queue order',
      detail: formatTimestamp(order.created_at, now),
      state: 'done',
    },
    { id: 'review', label: 'Review order', state: inQueue && !checked ? 'current' : 'done' },
    {
      id: 'check',
      label: 'Check stock',
      ...(checked ? { detail: check === 'available' ? 'Available' : 'Not available' } : {}),
      state: inQueue && !checked ? 'upcoming' : 'done',
    },
    decision,
    {
      id: 'dispatch',
      label: 'Dispatch',
      ...(order.delivery ? { detail: order.delivery.note_number } : {}),
      state: afterDispatch ? 'done' : status === 'confirmed' ? 'current' : 'upcoming',
    },
    {
      id: 'received',
      label: 'Received at hotspot',
      ...(order.received_at ? { detail: formatTimestamp(order.received_at, now) } : {}),
      state: status === 'received' ? 'done' : isInDelivery(status) ? 'current' : 'upcoming',
    },
  ];
}

const REVIEW_DETAIL = {
  sent: 'Not opened yet',
  under_review: 'Under review',
  queued: 'Queued for picking',
  on_hold: 'On hold',
} as const;

/** A warehouse request's progress, from sending it to the district store's stock being updated. */
export function requestSteps(request: WarehouseRequest, now?: Date): Step[] {
  const { status } = request;
  const waiting = isAwaitingWarehouse(status);
  const arrived = status === 'received';
  const reviewDetail = waiting ? REVIEW_DETAIL[status] : undefined;
  return [
    {
      id: 'sent',
      label: 'Request sent',
      detail: formatTimestamp(request.created_at, now),
      state: 'done',
    },
    {
      id: 'review',
      label: `${request.warehouse} review`,
      ...(reviewDetail ? { detail: reviewDetail } : {}),
      state: status === 'on_hold' ? 'attention' : waiting ? 'current' : 'done',
    },
    {
      id: 'dispatched',
      label: 'Dispatched',
      ...(request.dispatch ? { detail: formatTimestamp(request.dispatch.dispatched_at, now) } : {}),
      state: waiting ? 'upcoming' : 'done',
    },
    {
      id: 'receive',
      label: 'Receive and verify',
      ...(request.receipt?.discrepancy ? { detail: 'Discrepancy noted' } : {}),
      state: arrived ? 'done' : status === 'dispatched' ? 'current' : 'upcoming',
    },
    {
      id: 'stock',
      label: 'Stock updated',
      ...(request.receipt ? { detail: formatTimestamp(request.receipt.received_at, now) } : {}),
      state: arrived ? 'done' : 'upcoming',
    },
  ];
}
