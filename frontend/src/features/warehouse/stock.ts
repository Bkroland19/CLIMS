import type { Band, Movement, MovementReason, StockBatch } from '@/features/inventory/api';
import { formatDate, formatNumber } from '@/lib/format';
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
  { value: 'expiring', label: 'Expiring within 3 months' },
  { value: 'under_1_month', label: 'Under 1 month' },
  { value: 'under_3_months', label: 'Under 3 months' },
  { value: 'under_6_months', label: 'Under 6 months' },
  { value: 'ok', label: '6 months or more' },
  { value: 'unknown', label: 'No expiry date' },
] as const satisfies readonly { value: 'all' | 'expiring' | Band; label: string }[];

export type BatchFilter = (typeof BATCH_FILTERS)[number]['value'];

export function batchFilterFrom(param: string | null): BatchFilter {
  return BATCH_FILTERS.find((filter) => filter.value === param)?.value ?? 'all';
}

export function keepsBatch(filter: BatchFilter, batch: StockBatch): boolean {
  if (filter === 'expiring')
    return batch.band === 'under_1_month' || batch.band === 'under_3_months';
  return filter === 'all' || batch.band === filter;
}

/** What each ledger reason reads as. */
export const MOVEMENT_LABEL: Record<MovementReason, { label: string; tone: StatusTone }> = {
  receipt: { label: 'Stock registered', tone: 'positive' },
  order_receipt: { label: 'Received from warehouse', tone: 'positive' },
  hotspot_delivery: { label: 'Dispatched to hotspot', tone: 'info' },
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

/** The edit batch form as typed. */
export interface BatchEditFields {
  batchNumber: string;
  /** YYYY-MM-DD, from a date input. */
  expiryDate: string;
  onHand: string;
  note: string;
}

export interface BatchEditCheck {
  /** Why a field is not accepted, by field. */
  errors: Partial<Record<keyof BatchEditFields, string>>;
  /** The form still says what the batch already holds. */
  unchanged: boolean;
  /** A batch already held with this number and expiry: saving makes the two one batch. */
  joins: StockBatch | null;
  /** The change in quantity, or null while the quantity is not a whole number. */
  delta: number | null;
  /** The expiry date has passed: the batch will count as expired. */
  expired: boolean;
}

const MAX_QUANTITY = 1_000_000_000;

/**
 * Checks an edit of `batch` against the other batches the store holds (`held`, any product), as
 * the API will: one batch number has one expiry date at a store, and a batch keeps at least one
 * unit (deleting removes all of it). `today` is Uganda's date, YYYY-MM-DD.
 */
export function checkBatchEdit(
  fields: BatchEditFields,
  batch: StockBatch,
  held: readonly StockBatch[],
  today: string,
): BatchEditCheck {
  const errors: BatchEditCheck['errors'] = {};
  const number = fields.batchNumber.trim();
  const expiry = fields.expiryDate;
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(expiry) && !Number.isNaN(Date.parse(expiry));
  const twins = held.filter(
    (other) =>
      other.id !== batch.id &&
      other.store_id === batch.store_id &&
      other.condom_id === batch.condom_id &&
      other.unit_of_measure_id === batch.unit_of_measure_id &&
      other.batch_number === number,
  );
  if (number === '') errors.batchNumber = 'Enter the batch number printed on the cartons.';
  else if (number.length > 60) errors.batchNumber = 'Use at most 60 characters.';
  if (!validDate) errors.expiryDate = 'Enter the expiry date printed on the cartons.';
  const clash = validDate ? twins.find((other) => other.expiry_date !== expiry) : undefined;
  if (clash && !errors.batchNumber) {
    errors.batchNumber = `Batch ${number} is already held with expiry ${
      clash.expiry_date ? formatDate(clash.expiry_date) : 'not recorded'
    }. Use that date, or check the number.`;
  }

  const trimmed = fields.onHand.trim();
  const quantity = /^\d+$/.test(trimmed) ? Number(trimmed) : null;
  if (quantity === null || !Number.isSafeInteger(quantity)) {
    errors.onHand = 'Enter the quantity on the shelf, as a whole number.';
  } else if (quantity < 1) {
    errors.onHand = 'Enter at least 1. To remove the whole batch, delete it instead.';
  } else if (quantity > MAX_QUANTITY) {
    errors.onHand = `Enter at most ${formatNumber(MAX_QUANTITY)}.`;
  }
  if (fields.note.trim() === '') errors.note = 'Say why the batch is changing.';

  const delta = errors.onHand || quantity === null ? null : quantity - batch.on_hand;
  return {
    errors,
    unchanged: number === batch.batch_number && expiry === batch.expiry_date && delta === 0,
    joins:
      validDate && !clash ? (twins.find((other) => other.expiry_date === expiry) ?? null) : null,
    delta,
    expired: validDate && expiry < today,
  };
}
