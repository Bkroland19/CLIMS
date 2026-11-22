import { formatNumber } from '@/lib/format';
import type { StatusTone } from '@/lib/status';

import type { Order, OrderStatus, StockBalance } from './api';

/**
 * What an order is to the district:
 * - `alert`: a hotspot's stockout alert (names a hotspot, has no parent);
 * - `request`: a warehouse request, the child of the alert it restocks for;
 * - `other`: a store order from the legacy flow, which the DCFP screens leave out.
 */
export type OrderKind = 'alert' | 'request' | 'other';

export function kindOf(order: Pick<Order, 'hot_spot_id' | 'parent_order_id'>): OrderKind {
  if (order.parent_order_id !== null) return 'request';
  if (order.hot_spot_id !== null) return 'alert';
  return 'other';
}

export function alertsIn(orders: readonly Order[]): Order[] {
  return orders.filter((order) => kindOf(order) === 'alert');
}

export function requestsIn(orders: readonly Order[]): Order[] {
  return orders.filter((order) => kindOf(order) === 'request');
}

export interface StatusLabel {
  label: string;
  tone: StatusTone;
}

/** How an alert's status reads to the DCFP. Alerts only pass through these four. */
const ALERT_STATUS: Partial<Record<OrderStatus, StatusLabel>> = {
  queued: { label: 'New', tone: 'info' },
  on_hold: { label: 'Waiting for warehouse', tone: 'caution' },
  dispatched: { label: 'With rider', tone: 'info' },
  delivered: { label: 'Delivered', tone: 'positive' },
};

/** How a warehouse request's status reads to the district that sent it. */
const REQUEST_STATUS: Partial<Record<OrderStatus, StatusLabel>> = {
  queued: { label: 'Sent', tone: 'info' },
  reviewed: { label: 'Reviewed', tone: 'info' },
  confirmed: { label: 'Stock confirmed', tone: 'info' },
  on_hold: { label: 'Warehouse short', tone: 'caution' },
  dispatched: { label: 'In transit', tone: 'info' },
  received: { label: 'Received', tone: 'positive' },
};

/** A status no label is written for, in plain words and a neutral tone. */
function plainStatus(status: OrderStatus): StatusLabel {
  const words = status.replaceAll('_', ' ');
  return { label: words.charAt(0).toUpperCase() + words.slice(1), tone: 'neutral' };
}

export function alertStatus(status: OrderStatus): StatusLabel {
  return ALERT_STATUS[status] ?? plainStatus(status);
}

export function requestStatus(status: OrderStatus): StatusLabel {
  return REQUEST_STATUS[status] ?? plainStatus(status);
}

/** The store's available stock of a product, over every unit it is held in. */
export function availableFor(stock: readonly StockBalance[], condomId: string): number {
  return stock
    .filter((row) => row.condom_id === condomId)
    .reduce((total, row) => total + Math.max(row.available, 0), 0);
}

/**
 * Whether a held alert can now be sent from the district store: some of its
 * product is available. The DCFP picks the unit and quantity when sending.
 */
export function canSendNow(alert: Order, stock: readonly StockBalance[]): boolean {
  return (
    kindOf(alert) === 'alert' &&
    alert.order_status === 'on_hold' &&
    availableFor(stock, alert.condom_id) > 0
  );
}

/** The held alerts among `orders` that can now be sent. */
export function sendableHeld(orders: readonly Order[], stock: readonly StockBalance[]): Order[] {
  return orders.filter((order) => canSendNow(order, stock));
}

/**
 * The warehouse request made for an alert: the open one if there is one (an
 * alert has at most one), else the most recent.
 */
export function requestFor(alertId: string, orders: readonly Order[]): Order | null {
  const made = orders
    .filter((order) => order.parent_order_id === alertId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return made.find((request) => request.order_status !== 'received') ?? made[0] ?? null;
}

/** "20 × Box", or the number alone when the unit is not known. */
export function formatQuantity(quantity: number | null, unit: string | null): string {
  if (quantity === null) return 'No quantity yet';
  return unit ? `${formatNumber(quantity)} × ${unit}` : formatNumber(quantity);
}
