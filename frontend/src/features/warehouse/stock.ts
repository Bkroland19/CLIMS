import type { Band, Movement, MovementReason, StockBatch } from '@/features/inventory/api';
import { formatNumber } from '@/lib/format';
import type { StatusTone } from '@/lib/status';

/*
 * A warehouse's stock as the stock screen shows it (docs/modules/inventory.md): batches by shelf
 * life, the ledger in words, and adjustments as people think of them (a count of what is on the
 * shelf, or how many were damaged, expired or lost).
 */

/** The batch list's filters, in the order they are shown. `band` in the address picks one. */
export const BATCH_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'expired', label: 'Expired' },
  { value: 'under_1_month', label: 'Under 1 month' },
  { value: 'under_3_months', label: 'Under 3 months' },
  { value: 'under_6_months', label: 'Under 6 months' },
  { value: 'ok', label: '6 months or more' },
  { value: 'unknown', label: 'No expiry date' },
] as const satisfies readonly { value: 'all' | Band; label: string }[];

export type BatchFilter = (typeof BATCH_FILTERS)[number]['value'];

export function batchFilterFrom(param: string | null): BatchFilter {
  return BATCH_FILTERS.find((filter) => filter.value === param)?.value ?? 'all';
}

export function keepsBatch(filter: BatchFilter, batch: StockBatch): boolean {
  return filter === 'all' || batch.band === filter;
}

/** What each ledger reason reads as. */
export const MOVEMENT_LABEL: Record<MovementReason, { label: string; tone: StatusTone }> = {
  receipt: { label: 'Delivery', tone: 'positive' },
  order_receipt: { label: 'Received from warehouse', tone: 'positive' },
  dispatch: { label: 'Dispatched', tone: 'info' },
  adjustment: { label: 'Adjustment', tone: 'neutral' },
  opening: { label: 'Opening balance', tone: 'neutral' },
};

/** A change with its sign, e.g. "+120" or "−40". */
export function signed(value: number): string {
  if (value > 0) return `+${formatNumber(value)}`;
  if (value < 0) return `−${formatNumber(-value)}`;
  return '0';
}

/** A ledger entry's batch in words, or null for an order step. */
export function movementBatch(movement: Movement): string | null {
  if (movement.batch_number) return movement.batch_number;
  if (movement.reason === 'receipt' || movement.reason === 'adjustment') return 'No batch number';
  return null;
}

/** What happened to a batch: a count corrects it either way; the rest take stock away. */
export type AdjustmentKind = 'count' | 'damaged' | 'expired' | 'lost';

export const ADJUSTMENT_KINDS: readonly {
  value: AdjustmentKind;
  label: string;
  description: string;
}[] = [
  {
    value: 'count',
    label: 'Stock count',
    description: 'Enter what is on the shelf; the difference is recorded.',
  },
  { value: 'damaged', label: 'Damaged', description: 'Cartons that cannot be issued.' },
  { value: 'expired', label: 'Expired', description: 'Write off stock past its expiry date.' },
  { value: 'lost', label: 'Lost', description: 'Stock that cannot be found.' },
];

const KIND_NOTE: Record<AdjustmentKind, string> = {
  count: 'Stock count',
  damaged: 'Damaged',
  expired: 'Expired, written off',
  lost: 'Lost',
};

/** The adjustment's note: what happened, then why in the person's words. */
export function adjustmentNote(kind: AdjustmentKind, why: string): string {
  return `${KIND_NOTE[kind]}: ${why.trim()}`;
}

export interface AdjustmentCheck {
  /** The signed change to send, or null when the entry does not give one. */
  quantity: number | null;
  error: string | null;
}

/**
 * The change an adjustment makes to a batch holding `onHand`: a count is what is on the shelf now,
 * and the rest are how many to take away.
 */
export function checkAdjustment(
  kind: AdjustmentKind,
  entered: string,
  onHand: number,
): AdjustmentCheck {
  const trimmed = entered.trim();
  const value = /^\d+$/.test(trimmed) ? Number(trimmed) : null;
  if (value === null || !Number.isSafeInteger(value)) {
    return {
      quantity: null,
      error:
        kind === 'count'
          ? 'Enter the number on the shelf, as a whole number.'
          : 'Enter how many, as a whole number.',
    };
  }
  if (kind === 'count') {
    if (value === onHand) {
      return {
        quantity: null,
        error: 'The count matches what is recorded; there is nothing to correct.',
      };
    }
    return { quantity: value - onHand, error: null };
  }
  if (value < 1) return { quantity: null, error: 'Enter how many, as a whole number.' };
  if (value > onHand) {
    return { quantity: null, error: `The batch holds only ${formatNumber(onHand)}.` };
  }
  return { quantity: -value, error: null };
}
