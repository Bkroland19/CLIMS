import type { ProductKey } from './products';

/** A batch expiring within this many months is flagged: it can still be issued, to be used first. */
export const NEAR_EXPIRY_MONTHS = 3;
/** Stock received with less shelf life than this is flagged at receipt. */
export const MIN_SHELF_MONTHS = 6;

/** Average month length, as the prototype counts it. */
const MONTH_MS = 30.44 * 24 * 60 * 60 * 1000;

/**
 * Where a batch stands on shelf life: `expired` cannot be issued, `near`
 * should be used first, `short` has less than the minimum shelf life for
 * stock being received, `ok` is fine.
 */
export type ExpiryState = 'expired' | 'near' | 'short' | 'ok';

export interface Expiry {
  state: ExpiryState;
  /** "Expired", "12 days left" or "8 months left". */
  left: string;
}

/** Months from `now` to the start of the calendar day `expiresOn` (YYYY-MM-DD). */
export function monthsUntil(expiresOn: string, now: Date): number {
  const [year = 0, month = 1, day = 1] = expiresOn.split('-').map(Number);
  return (Date.UTC(year, month - 1, day) - now.getTime()) / MONTH_MS;
}

export function expiryOf(expiresOn: string, now: Date): Expiry {
  const months = monthsUntil(expiresOn, now);
  if (!Number.isFinite(months)) return { state: 'ok', left: '' };
  if (months <= 0) return { state: 'expired', left: 'Expired' };
  const left =
    months < 1
      ? `${String(Math.max(1, Math.round(months * 30.44)))} days left`
      : `${String(Math.floor(months))} months left`;
  if (months < NEAR_EXPIRY_MONTHS) return { state: 'near', left };
  if (months < MIN_SHELF_MONTHS) return { state: 'short', left };
  return { state: 'ok', left };
}

/** Whether a batch may be issued to a hotspot. Near-expiry batches may; expired ones may not. */
export function canIssue(expiresOn: string, now: Date): boolean {
  return expiryOf(expiresOn, now).state !== 'expired';
}

export interface BatchStock {
  product: ProductKey;
  batch: string;
  expires_on: string;
  quantity: number;
}

export interface BatchPick {
  product: ProductKey;
  batch: string;
  quantity: number;
}

/**
 * First-expiry-first-out: the batches to take `quantity` pieces of `product`
 * from, earliest expiry first, skipping expired batches. `short` is what the
 * batches could not cover. The server allocates the same way when no picks
 * are sent.
 */
export function suggestPicks(
  batches: readonly BatchStock[],
  product: ProductKey,
  quantity: number,
  now: Date,
): { picks: BatchPick[]; short: number } {
  let remaining = Math.max(0, quantity);
  const picks: BatchPick[] = [];
  const candidates = batches
    .filter(
      (batch) => batch.product === product && batch.quantity > 0 && canIssue(batch.expires_on, now),
    )
    .sort((a, b) => a.expires_on.localeCompare(b.expires_on));
  for (const batch of candidates) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, batch.quantity);
    picks.push({ product, batch: batch.batch, quantity: take });
    remaining -= take;
  }
  return { picks, short: remaining };
}
