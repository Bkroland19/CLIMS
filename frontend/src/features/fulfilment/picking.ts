import type { PickInput } from './api';
import { expiryOf, suggestPicks } from './batches';
import { parsePieces, PRODUCTS, productOf, type ProductKey, type Quantities } from './products';
import { formatNumber } from '@/lib/format';

/** A batch held in the district store, as the store endpoint lists it. */
export interface StoreBatch {
  product: ProductKey;
  batch: string;
  manufactured_on: string;
  expires_on: string;
  quantity: number;
}

/** What the DCFP has typed into the pick table, by {@link pickKey}. Untouched cells are absent. */
export type PickEntries = Readonly<Record<string, string>>;

/**
 * The key of one pick cell. It includes the quantity needed, so changing the
 * approved quantity drops earlier edits and the suggestion is made afresh.
 */
export const pickKey = (product: ProductKey, batch: string, need: number) =>
  `${product}:${batch}:${String(need)}`;

export interface PickLot {
  key: string;
  batch: StoreBatch;
  /** The cell's text: what was typed, or the suggestion. Empty for an expired batch. */
  text: string;
  /** Pieces taken from this batch; 0 while the text is not a number. */
  taking: number;
  canIssue: boolean;
  isNearExpiry: boolean;
  /** The first batch the suggestion takes from. */
  isFirstOut: boolean;
  error: 'not-a-number' | 'more-than-available' | null;
}

export interface PickGroup {
  product: ProductKey;
  need: number;
  lots: PickLot[];
  total: number;
  batchesUsed: number;
  nearExpiryPieces: number;
}

export interface PickPlan {
  groups: PickGroup[];
  /** The picks to send, one per batch taken from. */
  lines: PickInput[];
  /** Why the picks cannot be sent yet, e.g. "Male condoms: picking 300 of 800". */
  problems: string[];
}

/**
 * The batch-pick table for an order: for each product needed, the store's
 * batches by earliest expiry, the first-expiry-first-out suggestion, and what
 * the DCFP has changed. Picks must add up to what is needed and no batch can
 * give more than it holds.
 */
export function planPicks(
  batches: readonly StoreBatch[],
  needs: Quantities,
  entries: PickEntries,
  now: Date,
): PickPlan {
  const groups: PickGroup[] = [];
  const lines: PickInput[] = [];
  const problems: string[] = [];

  for (const { key: product } of PRODUCTS) {
    const need = needs[product];
    if (need <= 0) continue;
    const lots = batches
      .filter((batch) => batch.product === product)
      .sort((a, b) => a.expires_on.localeCompare(b.expires_on));
    const suggestion = suggestPicks(lots, product, need, now).picks;
    const firstOut = suggestion[0]?.batch;

    const rows = lots.map((batch): PickLot => {
      const key = pickKey(product, batch.batch, need);
      const { state } = expiryOf(batch.expires_on, now);
      const canIssue = state !== 'expired';
      const suggested = suggestion.find((pick) => pick.batch === batch.batch)?.quantity ?? 0;
      const text = canIssue ? (entries[key] ?? String(suggested)) : '';
      const parsed = canIssue ? parsePieces(text === '' ? '0' : text) : 0;
      const error =
        parsed === null ? 'not-a-number' : parsed > batch.quantity ? 'more-than-available' : null;
      return {
        key,
        batch,
        text,
        taking: parsed === null ? 0 : Math.min(parsed, batch.quantity),
        canIssue,
        isNearExpiry: state === 'near',
        isFirstOut: batch.batch === firstOut,
        error,
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
      nearExpiryPieces: taken
        .filter((row) => row.isNearExpiry)
        .reduce((sum, row) => sum + row.taking, 0),
    });
    lines.push(...taken.map((row) => ({ product, batch: row.batch.batch, quantity: row.taking })));

    const { name } = productOf(product);
    if (rows.some((row) => row.error !== null)) {
      problems.push(`${name}: check the highlighted batches`);
    } else if (total !== need) {
      problems.push(`${name}: picking ${formatNumber(total)} of ${formatNumber(need)}`);
    }
  }

  return { groups, lines, problems };
}
