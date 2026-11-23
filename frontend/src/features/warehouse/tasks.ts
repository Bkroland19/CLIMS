import type { StockBatch } from '@/features/inventory/api';
import { BAND_STATUS, batchLabel } from '@/features/inventory/bands';
import type { Order } from '@/features/orders/api';
import { formatNumber } from '@/lib/format';
import type { StatusTone } from '@/lib/status';

import { WAREHOUSE_PATHS } from './paths';
import { requestStatus } from './requests';

export interface WarehouseTask {
  id: string;
  status: { label: string; tone: StatusTone };
  title: string;
  detail: string;
  action: string;
  /** A warehouse path without the store. */
  href: string;
}

/** Names the dashboard needs for an order: its district, product and an amount in its unit. */
export interface TaskNames {
  store: (id: string) => string;
  product: (id: string | null, category: string | null) => string;
  quantity: (value: number | null, unitId: string | null) => string;
}

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);
const sum = (batches: readonly StockBatch[]) =>
  batches.reduce((total, batch) => total + batch.on_hand, 0);

/**
 * What needs the warehouse, in the order it needs doing: manage new orders, reserve or recheck
 * approved ones, dispatch reserved ones, write off expired batches, send short-dated batches
 * first, and recount stock held without an expiry date.
 */
export function warehouseTasks(
  orders: readonly Order[],
  batches: readonly StockBatch[],
  names: TaskNames,
  formatTime: (iso: string) => string,
): WarehouseTask[] {
  const tasks: WarehouseTask[] = [];
  const amount = (order: Order, value: number | null) =>
    names.quantity(value, order.unit_of_measure_id);
  const product = (order: Order) => names.product(order.condom_id, order.condom_category);
  const district = (order: Order) => names.store(order.ordered_for_store_id);
  const withStatus = (status: Order['order_status']) =>
    orders.filter((order) => order.order_status === status);

  for (const order of withStatus('queued')) {
    tasks.push({
      id: `decide-${order.id}`,
      status: requestStatus(order),
      title: `Manage ${district(order)}'s order for ${amount(order, order.quantity_needed)}`,
      detail: `${product(order)} · received ${formatTime(order.created_at)}`,
      action: 'Manage order',
      href: WAREHOUSE_PATHS.request(order.id),
    });
  }
  for (const order of withStatus('reviewed')) {
    tasks.push({
      id: `reserve-${order.id}`,
      status: requestStatus(order),
      title: `Reserve ${amount(order, order.quantity_approved)} for ${district(order)}`,
      detail: `${product(order)} · approved, stock not checked yet`,
      action: 'Check stock',
      href: WAREHOUSE_PATHS.request(order.id),
    });
  }
  for (const order of withStatus('confirmed')) {
    tasks.push({
      id: `dispatch-${order.id}`,
      status: requestStatus(order),
      title: `Dispatch ${amount(order, order.quantity_approved ?? order.quantity_needed)} to ${district(order)}`,
      detail: product(order),
      action: 'Dispatch',
      href: WAREHOUSE_PATHS.request(order.id),
    });
  }
  for (const order of withStatus('on_hold')) {
    tasks.push({
      id: `recheck-${order.id}`,
      status: requestStatus(order),
      title: `Check stock again for ${district(order)}`,
      detail: `${amount(order, order.quantity_approved ?? order.quantity_needed)} of ${product(order)} waits for stock`,
      action: 'Check again',
      href: WAREHOUSE_PATHS.request(order.id),
    });
  }

  const inBand = (band: StockBatch['band']) =>
    batches.filter((batch) => batch.band === band && batch.on_hand > 0);
  const list = (group: readonly StockBatch[]) => group.map(batchLabel).join(', ');

  const expired = inBand('expired');
  if (expired.length > 0) {
    tasks.push({
      id: 'expired',
      status: BAND_STATUS.expired,
      title: `Write off ${String(expired.length)} expired ${plural(expired.length, 'batch', 'batches')}`,
      detail: `${list(expired)} · ${formatNumber(sum(expired))} can't be dispatched`,
      action: 'View expired',
      href: WAREHOUSE_PATHS.stockWithBand('expired'),
    });
  }
  const lastMonth = inBand('under_1_month');
  if (lastMonth.length > 0) {
    tasks.push({
      id: 'under-1-month',
      status: BAND_STATUS.under_1_month,
      title: `${String(lastMonth.length)} ${plural(lastMonth.length, 'batch has', 'batches have')} under a month left`,
      detail: `${list(lastMonth)} · dispatching needs a documented reason`,
      action: 'View batches',
      href: WAREHOUSE_PATHS.stockWithBand('under_1_month'),
    });
  }
  const soon = inBand('under_3_months');
  if (soon.length > 0) {
    tasks.push({
      id: 'under-3-months',
      status: BAND_STATUS.under_3_months,
      title: `${String(soon.length)} ${plural(soon.length, 'batch expires', 'batches expire')} within 3 months`,
      detail: `${list(soon)} · they go out first`,
      action: 'View batches',
      href: WAREHOUSE_PATHS.stockWithBand('under_3_months'),
    });
  }
  const unknown = inBand('unknown');
  if (unknown.length > 0) {
    tasks.push({
      id: 'recount',
      status: BAND_STATUS.unknown,
      title: 'Record the batches of stock held without an expiry date',
      detail: `${formatNumber(sum(unknown))} held without a batch number or expiry date; it goes out last`,
      action: 'View stock',
      href: WAREHOUSE_PATHS.stockWithBand('unknown'),
    });
  }
  return tasks;
}
