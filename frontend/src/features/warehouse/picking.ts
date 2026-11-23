import type { StockBatch } from '@/features/inventory/api';

/*
 * What a dispatch takes (docs/modules/inventory.md#batches-and-expiry). The server picks the
 * batches itself, first expiry first out, unknown expiry last, and never an expired batch; a
 * batch with under one month left goes only with a documented exception. This plans the same
 * picks from the batch list, so the form can show them and ask for the exception before the
 * server refuses.
 */

export interface PlannedTake {
  batch: StockBatch;
  quantity: number;
}

export interface DispatchPlan {
  takes: PlannedTake[];
  /** What the plan covers; less than asked when unexpired stock is short. */
  total: number;
  /** Asked for but not covered by unexpired batches. */
  short: number;
  /** Takes from batches with under one month left, which need an exception reason. */
  nearExpiry: PlannedTake[];
}

/**
 * The batches a dispatch of `quantity` takes from `batches` (one store, product and unit, in the
 * order the API lists them: earliest expiry first, unknown expiry last).
 */
export function planDispatch(batches: readonly StockBatch[], quantity: number): DispatchPlan {
  const takes: PlannedTake[] = [];
  let left = Math.max(0, quantity);
  for (const batch of batches) {
    if (left === 0) break;
    if (batch.band === 'expired' || batch.on_hand <= 0) continue;
    const take = Math.min(left, batch.on_hand);
    takes.push({ batch, quantity: take });
    left -= take;
  }
  return {
    takes,
    total: Math.max(0, quantity) - left,
    short: left,
    nearExpiry: takes.filter((take) => take.batch.band === 'under_1_month'),
  };
}

/** Stock check-stock can still reserve: on hand less reserved and less expired batches. */
export function reservable(
  balance: { on_hand: number; reserved: number } | undefined,
  batches: readonly StockBatch[] | undefined,
): number {
  if (!balance) return 0;
  const expired = (batches ?? [])
    .filter((batch) => batch.band === 'expired')
    .reduce((sum, batch) => sum + batch.on_hand, 0);
  return Math.max(0, balance.on_hand - balance.reserved - expired);
}
