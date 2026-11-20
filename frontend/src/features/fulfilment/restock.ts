import { formatNumber } from '@/lib/format';

import type { BatchLine, ReceiptCondition, ReceiptLineInput } from './api';
import { parsePieces, type ProductKey, type Quantities } from './products';

/** Requests are rounded up to whole cartons: 1,000 male or 100 female condoms. */
export const REQUEST_STEP: Quantities = { male: 1000, female: 100 };

/**
 * What to ask a warehouse for so the district store covers `demand` (the
 * linked held orders) and is back at its minimum level, rounded up to whole
 * cartons.
 */
export function suggestedRequest(
  demand: Quantities,
  stock: Quantities,
  minimum: Quantities,
): Quantities {
  const round = (key: ProductKey) =>
    Math.ceil(Math.max(0, demand[key] + minimum[key] - stock[key]) / REQUEST_STEP[key]) *
    REQUEST_STEP[key];
  return { male: round('male'), female: round('female') };
}

/** The kinds of discrepancy a receipt can record, as the prototype lists them. */
export const DISCREPANCY_TYPES = [
  'Short delivery',
  'Excess delivery',
  'Damaged or expired',
  'Wrong product',
  'Wrong batch or expiry',
] as const;
export type DiscrepancyType = (typeof DISCREPANCY_TYPES)[number];

/** What the DCFP has entered for one waybill line. Untouched fields are absent. */
export interface ReceiptEntry {
  counted?: string;
  condition?: ReceiptCondition;
  damaged?: string;
}

/** One waybill line as counted at the store. */
export interface ReceiptRow {
  line: BatchLine;
  /** The text in the counted field: what was typed, or the waybill quantity. */
  countedText: string;
  /** The text in the damaged field; only used when the condition is Damaged. */
  damagedText: string;
  condition: ReceiptCondition;
  /** Null while the text is not a whole number. */
  counted: number | null;
  damaged: number | null;
  accepted: number;
  /** Counted minus the waybill quantity. */
  difference: number;
  countedError: string | null;
  damagedError: string | null;
}

/** The receipt table's rows: each waybill line with what has been entered for it. */
export function receiptRows(
  lines: readonly BatchLine[],
  entries: readonly ReceiptEntry[],
): ReceiptRow[] {
  return lines.map((line, index) => {
    const entry = entries[index] ?? {};
    const countedText = entry.counted ?? String(line.quantity);
    const condition = entry.condition ?? 'Intact';
    const damagedText = condition === 'Damaged' ? (entry.damaged ?? '0') : '0';
    const counted = parsePieces(countedText);
    const damaged = parsePieces(damagedText);
    const damagedError =
      damaged === null
        ? 'Enter a whole number'
        : counted !== null && damaged > counted
          ? 'More than counted'
          : null;
    const usable = counted ?? 0;
    return {
      line,
      countedText,
      damagedText,
      condition,
      counted,
      damaged,
      accepted: Math.max(0, usable - Math.min(damaged ?? 0, usable)),
      difference: usable - line.quantity,
      countedError: counted === null ? 'Enter a whole number' : null,
      damagedError,
    };
  });
}

/** Whether a row differs from the waybill: in count, damage or labelling. */
export function rowDiffers(row: ReceiptRow): boolean {
  return row.difference !== 0 || (row.damaged ?? 0) > 0 || row.condition !== 'Intact';
}

/** The discrepancy type to suggest, from the most specific problem found. */
export function defaultDiscrepancyType(rows: readonly ReceiptRow[]): DiscrepancyType {
  if (rows.some((row) => row.condition === 'Batch or expiry differs')) {
    return 'Wrong batch or expiry';
  }
  if (rows.some((row) => row.difference < 0)) return 'Short delivery';
  if (rows.some((row) => row.difference > 0)) return 'Excess delivery';
  return 'Damaged or expired';
}

/** "+200", "−200" or "0": a count against the waybill. */
export function formatDifference(difference: number): string {
  if (difference === 0) return '0';
  return `${difference > 0 ? '+' : '−'}${formatNumber(Math.abs(difference))}`;
}

/** What differs, batch by batch, e.g. "ENG-2409-117: −200 against the waybill, 50 damaged". */
export function discrepancySummary(rows: readonly ReceiptRow[]): string {
  return rows
    .filter(rowDiffers)
    .map((row) => {
      const damaged = row.damaged ?? 0;
      const parts = [
        row.difference !== 0 ? `${formatDifference(row.difference)} against the waybill` : null,
        damaged > 0 ? `${formatNumber(damaged)} damaged` : null,
        row.condition === 'Damaged' && damaged === 0 ? 'marked damaged' : null,
        row.condition === 'Batch or expiry differs'
          ? 'batch or expiry differs from the waybill'
          : null,
      ].filter(Boolean);
      return `${row.line.batch}: ${parts.join(', ')}`;
    })
    .join(' · ');
}

/** The rows as the receive endpoint takes them, or null while any row has an error. */
export function receiptInput(rows: readonly ReceiptRow[]): ReceiptLineInput[] | null {
  const lines: ReceiptLineInput[] = [];
  for (const row of rows) {
    if (row.counted === null || row.damaged === null || row.damagedError) return null;
    lines.push({
      product: row.line.product,
      batch: row.line.batch,
      counted: row.counted,
      damaged: row.damaged,
      condition: row.condition,
    });
  }
  return lines;
}
