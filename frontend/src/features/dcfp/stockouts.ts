import type { Step } from '@/components/StepTracker';
import type { Product } from '@/features/catalogue/api';
import { productName } from '@/features/catalogue/api';
import type { StatusTone } from '@/lib/status';

import type { StockBalance, StockoutDetail, StockoutEvent, StockoutStatus } from './api';
import { parseCount } from './orders';

/*
 * Fulfilling a stockout report (docs/modules/orders.md, "The district delivers and the hotspot
 * manager acknowledges"): the DCFP delivers from the district store, one or more products of the
 * categories the report asked for, and the hotspot's manager confirms what arrived. The report is
 * fulfilled once every category asked for has arrived.
 */

/** What each status means to the DCFP. */
export const STOCKOUT_STATUS: Record<StockoutStatus, { label: string; tone: StatusTone }> = {
  awaiting_supply: { label: 'Needs stock', tone: 'caution' },
  awaiting_acknowledgement: { label: 'Delivered, not confirmed', tone: 'info' },
  partly_received: { label: 'Part received', tone: 'caution' },
  fulfilled: { label: 'Fulfilled', tone: 'positive' },
};

export function stockoutSteps(report: Pick<StockoutDetail, 'status' | 'deliveries'>): Step[] {
  const delivered = report.deliveries.length > 0;
  return [
    { id: 'reported', label: 'Reported', state: 'done' },
    {
      id: 'delivered',
      label: 'Stock sent',
      state: delivered ? 'done' : 'current',
    },
    {
      id: 'confirmed',
      label: 'Receipt confirmed',
      detail:
        report.status === 'partly_received' ? 'Part of what was asked for has arrived' : undefined,
      state:
        report.status === 'fulfilled'
          ? 'done'
          : report.status === 'partly_received'
            ? 'attention'
            : delivered
              ? 'current'
              : 'upcoming',
    },
  ];
}

const SELECTION_TEXT: Record<StockoutEvent['selection'], string> = {
  male: 'male condoms',
  female: 'female condoms',
  both: 'male and female condoms',
};

/** What each step reads as in the report's history. */
export function stockoutEventLabel(event: Pick<StockoutEvent, 'action' | 'selection'>): string {
  switch (event.action) {
    case 'raised':
      return `Reported out of ${SELECTION_TEXT[event.selection]}`;
    case 'repeated':
      return 'Reported again';
    case 'selection_changed':
      return `Now asking for ${SELECTION_TEXT[event.selection]}`;
    case 'delivered':
      return 'Stock sent from the district store';
    case 'acknowledged':
      return 'The hotspot confirmed what arrived';
  }
}

/** Who acted at each step, for the history's role colour. */
export function stockoutEventRole(action: StockoutEvent['action']): 'dcfp' | 'hotspot-manager' {
  return action === 'delivered' ? 'dcfp' : 'hotspot-manager';
}

/** A product the DCFP can send for a report, with what the district store has of it. */
export interface DeliverableProduct {
  id: string;
  name: string;
  category: 'male' | 'female';
  unit: string;
  piecesPerUnit: number;
  /** In `unit`; null when the store's stock could not be read. */
  available: number | null;
}

/**
 * Active products of the categories a report asked for that can be counted out (they have a unit
 * and pieces per unit), with the district store's available stock in that unit. Products the
 * store has none of come last.
 */
export function deliverableProducts(
  products: readonly Product[],
  selection: StockoutDetail['selection'],
  balances: readonly StockBalance[] | null,
): DeliverableProduct[] {
  const rows: DeliverableProduct[] = [];
  for (const product of products) {
    const { category, unit, pieces_per_unit: piecesPerUnit } = product;
    if (!product.active || !category || !unit || !piecesPerUnit) continue;
    if (selection !== 'both' && category !== selection) continue;
    const balance = balances?.find(
      (row) => row.condom_id === product.id && row.unit_of_measure_id === unit.id,
    );
    rows.push({
      id: product.id,
      name: productName(product),
      category,
      unit: unit.name,
      piecesPerUnit,
      available: balances ? (balance?.available ?? 0) : null,
    });
  }
  return rows.sort(
    (a, b) =>
      Number((b.available ?? 1) > 0) - Number((a.available ?? 1) > 0) ||
      a.name.localeCompare(b.name),
  );
}

/** One line of the delivery form, as typed. */
export interface DraftLine {
  key: string;
  productId: string;
  quantity: string;
}

export interface LineErrors {
  productId?: string;
  quantity?: string;
}

/** What is wrong with each line, if anything: one product per line, a whole number in stock. */
export function deliveryLineErrors(
  lines: readonly DraftLine[],
  products: readonly DeliverableProduct[],
): LineErrors[] {
  return lines.map((line, index) => {
    const errors: LineErrors = {};
    const product = products.find((candidate) => candidate.id === line.productId);
    if (!product) errors.productId = 'Choose a product.';
    else if (lines.slice(0, index).some((other) => other.productId === line.productId))
      errors.productId = 'This product is already on another line.';
    const count = parseCount(line.quantity);
    if (count === null || count < 1) errors.quantity = 'Enter a whole number of at least 1.';
    else if (count > 1_000_000) errors.quantity = 'Enter at most 1,000,000.';
    else if (product && product.available !== null && count > product.available)
      errors.quantity =
        product.available === 0
          ? 'The district store has none of this product.'
          : `The district store has ${product.available.toLocaleString('en-GB')} available.`;
    return errors;
  });
}

/** Categories asked for that no line covers yet, e.g. a "both" report with only male lines. */
export function missingCategories(
  selection: StockoutDetail['selection'],
  lines: readonly DraftLine[],
  products: readonly DeliverableProduct[],
): ('male' | 'female')[] {
  const wanted: ('male' | 'female')[] = selection === 'both' ? ['male', 'female'] : [selection];
  const covered = new Set(
    lines.map((line) => products.find((product) => product.id === line.productId)?.category),
  );
  return wanted.filter((category) => !covered.has(category));
}
