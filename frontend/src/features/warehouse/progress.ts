import type { Step } from '@/components/StepTracker';
import type { WarehouseRequest } from '@/features/fulfilment/api';
import { formatTimestamp } from '@/lib/format';

import { shortfalls, type RequestStockCheck } from './dispatch';

/** Whether the warehouse has sent the stock (it may or may not have arrived yet). */
export const isDispatched = (request: WarehouseRequest) =>
  request.status === 'dispatched' || request.status === 'received';

/** Whether the warehouse has yet to accept the request. */
export const isNew = (request: WarehouseRequest) =>
  request.status === 'sent' || request.status === 'under_review';

/**
 * A district request's progress on the warehouse side: review, queue, check
 * stock, dispatch, then the district's receipt. `check` is the stock check
 * made on the request page; it only matters while the request is queued.
 */
export function warehouseSteps(
  request: WarehouseRequest,
  check: RequestStockCheck | null,
  now?: Date,
): Step[] {
  const { status } = request;
  const isQueued = status === 'queued';
  const past = isDispatched(request);
  const checkDetail =
    status === 'on_hold'
      ? 'Not available'
      : isQueued && check
        ? check.isAvailable
          ? 'Available'
          : 'Not available'
        : undefined;

  return [
    {
      id: 'review',
      label: 'Review request',
      detail: `Received ${formatTimestamp(request.created_at, now)}`,
      state: isNew(request) ? 'current' : 'done',
    },
    {
      id: 'queue',
      label: 'Queue request',
      state: isNew(request) ? 'upcoming' : 'done',
    },
    {
      id: 'check',
      label: 'Check stock',
      ...(checkDetail ? { detail: checkDetail } : {}),
      state:
        status === 'on_hold' || (isQueued && check && !check.isAvailable)
          ? 'attention'
          : past || (isQueued && check)
            ? 'done'
            : isQueued
              ? 'current'
              : 'upcoming',
    },
    {
      id: 'dispatch',
      label: 'Dispatch stock',
      ...(request.dispatch ? { detail: formatTimestamp(request.dispatch.dispatched_at, now) } : {}),
      state: past ? 'done' : isQueued && check?.isAvailable ? 'current' : 'upcoming',
    },
    {
      id: 'received',
      label: 'Received by district',
      ...(request.receipt ? { detail: formatTimestamp(request.receipt.received_at, now) } : {}),
      state: status === 'received' ? 'done' : status === 'dispatched' ? 'current' : 'upcoming',
    },
  ];
}

export interface Banner {
  variant: 'info' | 'success' | 'warning';
  title: string;
  body: string;
}

/** What is true of the request now and what to do next, as the prototype words it. */
export function requestBanner(
  request: WarehouseRequest,
  check: RequestStockCheck | null,
  now?: Date,
): Banner {
  const { district } = request;
  switch (request.status) {
    case 'sent':
    case 'under_review':
      return {
        variant: 'info',
        title: 'Review the request',
        body: `${request.requested_by} needs this stock for the ${district} district store. Accept it to queue it for picking.`,
      };
    case 'queued':
      if (!check) {
        return {
          variant: 'info',
          title: 'Queued for picking',
          body: 'Check that the stock is free before you dispatch.',
        };
      }
      return check.isAvailable
        ? {
            variant: 'success',
            title: 'Stock is available',
            body: 'Batches are suggested first-expiry-first-out. Check the picks, record the waybill, then dispatch.',
          }
        : {
            variant: 'warning',
            title: 'Not enough stock to fill this request',
            body: `${shortfalls(request.items, check).join('. ')}. Put the request on hold.`,
          };
    case 'on_hold':
      return {
        variant: 'warning',
        title: `On hold: ${(request.hold_reason ?? 'waiting for stock').toLowerCase()}`,
        body: `${district} DCFP was notified. Return the request to the queue to re-check stock when it arrives.`,
      };
    case 'dispatched':
      return {
        variant: 'info',
        title: request.dispatch
          ? `Dispatched ${formatTimestamp(request.dispatch.dispatched_at, now)}`
          : 'Dispatched',
        body: `${request.dispatch ? `Waybill ${request.dispatch.waybill} · ${request.dispatch.vehicle}. ` : ''}Waiting for ${district} to receive and verify.`,
      };
    case 'received': {
      const { receipt } = request;
      return {
        variant: 'success',
        title: receipt
          ? `Received by ${district} ${formatTimestamp(receipt.received_at, now)}`
          : `Received by ${district}`,
        body: receipt?.discrepancy
          ? `The district reported a discrepancy: ${receipt.discrepancy.type.toLowerCase()}. ${receipt.discrepancy.note}`
          : 'Quantities matched the waybill.',
      };
    }
  }
}
