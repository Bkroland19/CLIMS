import type { PickInput } from '@/features/fulfilment/api';
import {
  expiryOf,
  MIN_SHELF_MONTHS,
  suggestPicks,
  type ExpiryState,
} from '@/features/fulfilment/batches';
import { pickKey, type PickEntries } from '@/features/fulfilment/picking';
import {
  parsePieces,
  PRODUCTS,
  productOf,
  type ProductKey,
  type Quantities,
} from '@/features/fulfilment/products';
import { checkStock, type StockCheck } from '@/features/inventory/stockCheck';
import { formatNumber } from '@/lib/format';
import type { StatusTone } from '@/lib/status';

import type { WarehouseBatch } from './api';

/*
 * Warehouse stock rules, as the prototype sets them: a batch with at least
 * MIN_SHELF_MONTHS of shelf life left is dispatchable and is what the stock
 * check counts and the picks suggest. A batch with less can still be picked
 * by hand (the district is warned on the waybill); an expired batch cannot
 * leave the warehouse at all.
 */

/** How a warehouse batch is shown, by where it stands on shelf life. */
export const BATCH_STATUS: Record<ExpiryState, { label: string; tone: StatusTone }> = {
  ok: { label: 'Dispatchable', tone: 'positive' },
  short: { label: `Under ${String(MIN_SHELF_MONTHS)} months`, tone: 'info' },
  near: { label: 'Near expiry', tone: 'caution' },
  expired: { label: 'Expired', tone: 'negative' },
};

/** Whether a batch counts as free to dispatch: at least the minimum shelf life left. */
export function isDispatchable(expiresOn: string, now: Date): boolean {
  return expiryOf(expiresOn, now).state === 'ok';
}

/** Pieces of each product in batches with at least the minimum shelf life left. */
export function dispatchableStock(batches: readonly WarehouseBatch[], now: Date): Quantities {
  const total = { male: 0, female: 0 };
  for (const batch of batches) {
    if (isDispatchable(batch.expires_on, now)) total[batch.product] += batch.quantity;
  }
  return total;
}

export interface RequestStockCheck {
  /** Per product, against dispatchable stock. */
  checks: Record<ProductKey, StockCheck>;
  dispatchable: Quantities;
  /** True when every product needed is covered and something is needed at all. */
  isAvailable: boolean;
}

/** Checks a request's quantities against what the warehouse can dispatch now. */
export function checkRequestStock(
  items: Quantities,
  batches: readonly WarehouseBatch[],
  now: Date,
): RequestStockCheck {
  const dispatchable = dispatchableStock(batches, now);
  const checks = {
    male: checkStock(items.male, dispatchable.male),
    female: checkStock(items.female, dispatchable.female),
  };
  const values = Object.values(checks);
  return {
    checks,
    dispatchable,
    isAvailable:
      values.some((check) => check.status === 'available') &&
      values.every((check) => check.status !== 'short'),
  };
}

/** "Male condoms: 3,000 dispatchable, 8,000 needed", one per product that is short. */
export function shortfalls(items: Quantities, check: RequestStockCheck): string[] {
  return PRODUCTS.filter(({ key }) => check.checks[key].status === 'short').map(
    ({ key, name }) =>
      `${name}: ${formatNumber(check.dispatchable[key])} dispatchable, ${formatNumber(items[key])} needed`,
  );
}

export interface DispatchLot {
  key: string;
  batch: WarehouseBatch;
  expiry: ExpiryState;
  /** The cell's text: what was typed, or the suggestion. Empty for an expired batch. */
  text: string;
  /** Pieces taken from this batch; 0 while the text is not a number. */
  taking: number;
  canPick: boolean;
  /** Less than the minimum shelf life, but not expired: may be picked, with a warning. */
  isFlagged: boolean;
  /** The first batch the suggestion takes from. */
  isFirstOut: boolean;
  error: 'not-a-number' | 'more-than-available' | null;
}

export interface DispatchGroup {
  product: ProductKey;
  need: number;
  lots: DispatchLot[];
  total: number;
  batchesUsed: number;
  flaggedPieces: number;
}

export interface DispatchPlan {
  groups: DispatchGroup[];
  /** The waybill lines to send, one per batch taken from. */
  lines: PickInput[];
  /** Why the picks cannot be dispatched yet, e.g. "Male condoms: check the highlighted batches". */
  problems: string[];
  /** Picking less than was requested of some product. Allowed: the district sees the difference. */
  isPartial: boolean;
}

/**
 * The batch-pick table for a dispatch: for each product requested, the
 * warehouse's batches by earliest expiry, a first-expiry-first-out suggestion
 * from dispatchable batches, and what the user has changed. Picks may add up
 * to less than was requested, never more, and no batch can give more than it
 * holds.
 */
export function planDispatch(
  batches: readonly WarehouseBatch[],
  needs: Quantities,
  entries: PickEntries,
  now: Date,
): DispatchPlan {
  const groups: DispatchGroup[] = [];
  const lines: PickInput[] = [];
  const problems: string[] = [];

  for (const { key: product } of PRODUCTS) {
    const need = needs[product];
    if (need <= 0) continue;
    const lots = batches
      .filter((batch) => batch.product === product)
      .sort((a, b) => a.expires_on.localeCompare(b.expires_on));
    const dispatchable = lots.filter((batch) => isDispatchable(batch.expires_on, now));
    const suggestion = suggestPicks(dispatchable, product, need, now).picks;
    const firstOut = suggestion[0]?.batch;

    const rows = lots.map((batch): DispatchLot => {
      const key = pickKey(product, batch.batch, need);
      const { state } = expiryOf(batch.expires_on, now);
      const canPick = state !== 'expired';
      const suggested = suggestion.find((pick) => pick.batch === batch.batch)?.quantity ?? 0;
      const text = canPick ? (entries[key] ?? String(suggested)) : '';
      const parsed = canPick ? parsePieces(text === '' ? '0' : text) : 0;
      return {
        key,
        batch,
        expiry: state,
        text,
        taking: parsed === null ? 0 : Math.min(parsed, batch.quantity),
        canPick,
        isFlagged: state === 'near' || state === 'short',
        isFirstOut: batch.batch === firstOut,
        error:
          parsed === null ? 'not-a-number' : parsed > batch.quantity ? 'more-than-available' : null,
      };
    });

    const taken = rows.filter((row) => row.taking > 0);
    const total = taken.reduce((sum, row) => sum + row.taking, 0);
    groups.push({
      product,
      need,
      lots: rows,
      total,
      batchesUsed: taken.length,
      flaggedPieces: taken.filter((row) => row.isFlagged).reduce((sum, row) => sum + row.taking, 0),
    });
    lines.push(...taken.map((row) => ({ product, batch: row.batch.batch, quantity: row.taking })));

    const { name } = productOf(product);
    if (rows.some((row) => row.error !== null)) {
      problems.push(`${name}: check the highlighted batches`);
    } else if (total > need) {
      problems.push(
        `${name}: picking ${formatNumber(total)}, more than the ${formatNumber(need)} requested`,
      );
    }
  }

  if (problems.length === 0 && groups.length > 0 && lines.length === 0) {
    problems.push('Pick at least one batch');
  }

  return {
    groups,
    lines,
    problems,
    isPartial: groups.some((group) => group.total < group.need),
  };
}

export interface ProductStock {
  product: ProductKey;
  total: number;
  dispatchable: number;
  /** Under the minimum shelf life but not expired. */
  flagged: number;
  expired: number;
  /** The earliest expiry date of any batch held, or null with no batches. */
  nextExpiry: string | null;
}

/** Each product's stock split by shelf life, for the stock page's cards. */
export function productStock(batches: readonly WarehouseBatch[], now: Date): ProductStock[] {
  return PRODUCTS.map(({ key }) => {
    const held = batches
      .filter((batch) => batch.product === key)
      .sort((a, b) => a.expires_on.localeCompare(b.expires_on));
    const summary: ProductStock = {
      product: key,
      total: 0,
      dispatchable: 0,
      flagged: 0,
      expired: 0,
      nextExpiry: held[0]?.expires_on ?? null,
    };
    for (const batch of held) {
      const { state } = expiryOf(batch.expires_on, now);
      summary.total += batch.quantity;
      if (state === 'ok') summary.dispatchable += batch.quantity;
      else if (state === 'expired') summary.expired += batch.quantity;
      else summary.flagged += batch.quantity;
    }
    return summary;
  });
}
