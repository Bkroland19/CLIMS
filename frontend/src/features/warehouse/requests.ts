import type { Step } from '@/components/StepTracker';
import type { WarehouseCode } from '@/features/fulfilment/api';
import type { Order, OrderStatus, Warehouse } from '@/features/orders/api';
import type { StatusTone } from '@/lib/status';
import type { NavCounts } from '@/navigation/navigation';

import { WAREHOUSE_PATHS } from './paths';

/*
 * The district orders a warehouse receives, as the warehouse sees them (docs/modules/orders.md):
 * a DCFP's order for a condom category arrives queued; the warehouse approves it for a product,
 * all or part, which reserves the stock or holds the order until stock arrives; it dispatches
 * what is reserved; the district counts it in. Before dispatch the warehouse may reject it with a
 * reason instead.
 */

/** The Go store behind a warehouse code: NMS or JMS, matched on the store's code. */
export function warehouseStoreOf(
  code: WarehouseCode,
  warehouses: readonly Warehouse[] | undefined,
): Warehouse | undefined {
  return warehouses?.find((store) => store.code.toUpperCase() === code);
}

/**
 * The orders districts placed with this warehouse, newest first. Alert orders raised before
 * stockouts became reports, and generic store-to-store requests, are not warehouse orders.
 */
export function ordersAt(orders: readonly Order[], storeId: string): Order[] {
  return orders.filter(
    (order) =>
      order.ordered_from_store_id === storeId &&
      order.hot_spot_id === null &&
      order.order_status !== 'pending' &&
      order.order_status !== 'fulfilled',
  );
}

/** What each status means to the warehouse. */
export const REQUEST_STATUS: Partial<Record<OrderStatus, { label: string; tone: StatusTone }>> = {
  queued: { label: 'New', tone: 'info' },
  // Approved but stock not checked yet: the check failed or was interrupted.
  reviewed: { label: 'Approved', tone: 'info' },
  on_hold: { label: 'Waiting for stock', tone: 'caution' },
  confirmed: { label: 'To dispatch', tone: 'caution' },
  dispatched: { label: 'In transit', tone: 'info' },
  received: { label: 'Received', tone: 'positive' },
  rejected: { label: 'Rejected', tone: 'negative' },
};

export function requestStatus(order: Order): { label: string; tone: StatusTone } {
  return REQUEST_STATUS[order.order_status] ?? { label: order.order_status, tone: 'neutral' };
}

/** Orders the warehouse has to act on now: decide, finish the stock check, or dispatch. */
export function needsWarehouse(order: Order): boolean {
  return ['queued', 'reviewed', 'confirmed'].includes(order.order_status);
}

/** The request list's filters, in the order they are shown. `status` in the address picks one. */
export const REQUEST_FILTERS = [
  { value: 'all', label: 'All', keeps: () => true },
  {
    value: 'queued',
    label: 'New',
    keeps: (order) => order.order_status === 'queued' || order.order_status === 'reviewed',
  },
  {
    value: 'on_hold',
    label: 'Waiting for stock',
    keeps: (order) => order.order_status === 'on_hold',
  },
  {
    value: 'confirmed',
    label: 'To dispatch',
    keeps: (order) => order.order_status === 'confirmed',
  },
  {
    value: 'dispatched',
    label: 'In transit',
    keeps: (order) => order.order_status === 'dispatched',
  },
  { value: 'received', label: 'Received', keeps: (order) => order.order_status === 'received' },
  { value: 'rejected', label: 'Rejected', keeps: (order) => order.order_status === 'rejected' },
] as const satisfies readonly { value: string; label: string; keeps: (order: Order) => boolean }[];

export type RequestFilter = (typeof REQUEST_FILTERS)[number];

export function requestFilterFrom(param: string | null): RequestFilter {
  return REQUEST_FILTERS.find((filter) => filter.value === param) ?? REQUEST_FILTERS[0];
}

/** The sidebar badge: orders waiting for the warehouse to decide or to dispatch. */
export function warehouseCounts(orders: readonly Order[] | undefined): NavCounts {
  return { [WAREHOUSE_PATHS.requests]: orders?.filter(needsWarehouse).length };
}

/** The index of the last step done at each status; on hold, the order has been approved. */
const STEPS_DONE: Partial<Record<OrderStatus, number>> = {
  queued: 0,
  reviewed: 1,
  on_hold: 1,
  confirmed: 2,
  dispatched: 3,
  received: 4,
};

/**
 * The order's progress on the warehouse side. A held order is marked for attention on the stock
 * step; a rejected order stops at the decision, marked for attention.
 */
export function requestSteps(order: Order): Step[] {
  const { order_status: status } = order;
  if (status === 'rejected') {
    return [
      { id: 'received', label: 'Order received', state: 'done' },
      { id: 'decision', label: 'Rejected', state: 'attention' },
    ];
  }
  const reached = STEPS_DONE[status] ?? -1;
  const held = status === 'on_hold';
  const steps = [
    { id: 'received', label: 'Order received' },
    { id: 'decision', label: 'Approve' },
    { id: 'stock', label: held ? 'Waiting for stock' : 'Reserve stock' },
    { id: 'dispatched', label: 'Dispatch' },
    { id: 'counted', label: 'District receipt' },
  ];
  return steps.map((step, index): Step => {
    if (index <= reached) return { ...step, state: 'done' };
    if (index === reached + 1) return { ...step, state: held ? 'attention' : 'current' };
    return { ...step, state: 'upcoming' };
  });
}

export interface Banner {
  variant: 'info' | 'success' | 'warning' | 'destructive';
  title: string;
  body: string;
}

/**
 * What is true of the order now and what comes next, for the banner at the top of its page.
 * `quantity` names an amount in the order's unit, e.g. "500 boxes"; `product` the product chosen
 * or the category requested.
 */
export function requestBanner(
  order: Order,
  district: string,
  product: string,
  quantity: (value: number | null) => string,
): Banner {
  const approved = order.quantity_approved ?? order.quantity_needed;
  switch (order.order_status) {
    case 'queued':
      return {
        variant: 'info',
        title: 'Waiting for your decision',
        body: `${district} ordered ${quantity(order.quantity_needed)} of ${product.toLowerCase()}. Choose the product to send and approve it, all or part, or reject it with a reason.`,
      };
    case 'reviewed':
      return {
        variant: 'warning',
        title: 'Approved, but no stock is reserved yet',
        body: `Check the stock to reserve ${quantity(approved)} of ${product} for ${district}.`,
      };
    case 'on_hold':
      return {
        variant: 'warning',
        title: 'Waiting for stock',
        body: `There is not enough unexpired ${product} to reserve ${quantity(approved)}. Check again when stock arrives, approve less or another product, or reject the order.`,
      };
    case 'confirmed':
      return {
        variant: 'warning',
        title: `${quantity(approved)} reserved for ${district}`,
        body: 'Record the transport and dispatch. Batches leave first expiry first out. You can still reject the order, which releases the reservation.',
      };
    case 'dispatched':
      return {
        variant: 'info',
        title: `${quantity(order.quantity_issued)} on the way to ${district}`,
        body: 'The district counts it when it arrives; you are told what it counted.',
      };
    case 'received': {
      const differs = order.quantity_received !== order.quantity_issued;
      return differs
        ? {
            variant: 'warning',
            title: `${district} counted ${quantity(order.quantity_received)} of ${quantity(order.quantity_issued)}`,
            body: order.discrepancy_note ?? 'The count differed from the dispatch.',
          }
        : {
            variant: 'success',
            title: `Received in full at ${district}`,
            body: `${district} counted the ${quantity(order.quantity_received)} dispatched.`,
          };
    }
    case 'rejected':
      return {
        variant: 'destructive',
        title: 'This order was rejected',
        body: order.rejection_reason ?? 'No reason was recorded.',
      };
    default:
      return {
        variant: 'info',
        title: 'No action needed',
        body: 'This order has no warehouse steps.',
      };
  }
}

/** What each recorded step reads as in the order's history, from the warehouse's side. */
export function requestEventLabel(action: string, status: OrderStatus): string {
  switch (action) {
    case 'replenishment_requested':
      return 'Order received from the district';
    case 'review':
      return 'Approved';
    case 'check-stock':
      return status === 'on_hold'
        ? 'Stock checked: waiting for stock'
        : 'Stock checked and reserved';
    case 'reject':
      return 'Rejected';
    case 'dispatch':
      return 'Dispatched';
    case 'receive':
      return 'Received and counted by the district';
    default:
      return action.replaceAll(/[-_]/g, ' ');
  }
}

/** Steps the warehouse takes, for the history's role colour. */
export const WAREHOUSE_ACTIONS: ReadonlySet<string> = new Set([
  'review',
  'check-stock',
  'reject',
  'dispatch',
]);
