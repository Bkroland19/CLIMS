import type { Share } from '@/components/charts/ShareList';
import type { OrderStatus } from '@/features/fulfilment/api';
import { PRODUCTS } from '@/features/fulfilment/products';
import type { StatusTone } from '@/lib/status';

import type { DistrictStoreSummary, NationalSummary } from './api';

interface Stage {
  label: string;
  statuses: readonly OrderStatus[];
  color: string;
}

/** The stages an order moves through, as the prototype groups its statuses. */
const STAGES: readonly Stage[] = [
  { label: 'In queue', statuses: ['queued'], color: 'var(--chart-1)' },
  { label: 'On hold', statuses: ['on_hold'], color: 'var(--chart-4)' },
  { label: 'Confirmed', statuses: ['confirmed'], color: 'var(--chart-2)' },
  { label: 'With rider', statuses: ['dispatched', 'in_transit'], color: 'var(--chart-3)' },
  { label: 'Delivered, unconfirmed', statuses: ['delivered'], color: 'var(--chart-5)' },
  { label: 'Received', statuses: ['received'], color: 'var(--muted-foreground)' },
];

/** Hotspot orders counted by stage, for the dashboard's pipeline. */
export function ordersByStage(byStatus: NationalSummary['orders_by_status']): Share[] {
  return STAGES.map(({ label, statuses, color }) => ({
    label,
    value: statuses.reduce((total, status) => total + byStatus[status], 0),
    color,
  }));
}

/** Orders not yet received, and how many of them wait on stock. */
export function openOrders(byStatus: NationalSummary['orders_by_status']): {
  open: number;
  onHold: number;
} {
  const open = Object.entries(byStatus).reduce(
    (total, [status, value]) => (status === 'received' ? total : total + value),
    0,
  );
  return { open, onHold: byStatus.on_hold };
}

/** Pieces held across the national warehouses, in total and per warehouse. */
export function warehouseTotals(stock: NationalSummary['warehouse_stock']): {
  total: number;
  byWarehouse: { warehouse: string; pieces: number }[];
} {
  const byWarehouse = stock.map((entry) => ({
    warehouse: entry.warehouse,
    pieces: entry.stock.male + entry.stock.female,
  }));
  return { total: byWarehouse.reduce((sum, entry) => sum + entry.pieces, 0), byWarehouse };
}

export interface StockStatus {
  label: string;
  tone: StatusTone;
}

/**
 * A district store's stock in words: a product with none left is the worst
 * news, then anything under its minimum level.
 */
export function districtStockStatus({
  stock,
  min_levels: minimum,
}: Pick<DistrictStoreSummary, 'stock' | 'min_levels'>): StockStatus {
  const out = PRODUCTS.find((product) => stock[product.key] === 0);
  if (out) return { label: `${out.short} stocked out`, tone: 'negative' };
  const below = PRODUCTS.some((product) => stock[product.key] < minimum[product.key]);
  return below
    ? { label: 'Below minimum', tone: 'caution' }
    : { label: 'Above minimum', tone: 'positive' };
}
