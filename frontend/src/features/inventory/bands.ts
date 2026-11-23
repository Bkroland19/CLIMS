import type { StatusTone } from '@/lib/status';

import type { Band, StockBatch } from './api';

/*
 * How a batch's shelf life reads (reporting requirements v0.2, RF16). Expired stock never leaves a
 * store, and a batch with under one month left leaves only with a documented exception. The three
 * and six month marks are warnings only.
 */
export const BAND_STATUS: Record<Band, { label: string; tone: StatusTone }> = {
  expired: { label: 'Expired', tone: 'negative' },
  under_1_month: { label: 'Under 1 month', tone: 'negative' },
  under_3_months: { label: 'Under 3 months', tone: 'caution' },
  under_6_months: { label: 'Under 6 months', tone: 'neutral' },
  ok: { label: '6 months or more', tone: 'positive' },
  unknown: { label: 'Expiry not recorded', tone: 'neutral' },
};

/** "Expired 3 days ago", "12 days left", "4 months left", or "" without an expiry date. */
export function shelfLifeLeft(daysRemaining: number | null): string {
  if (daysRemaining === null) return '';
  if (daysRemaining < 0) {
    const ago = -daysRemaining;
    return `Expired ${String(ago)} ${ago === 1 ? 'day' : 'days'} ago`;
  }
  if (daysRemaining === 0) return 'Expires today';
  if (daysRemaining < 61)
    return `${String(daysRemaining)} ${daysRemaining === 1 ? 'day' : 'days'} left`;
  return `${String(Math.floor(daysRemaining / 30.44))} months left`;
}

/** A batch's label: its number, or a plain description when stock was recorded without one. */
export function batchLabel(batch: Pick<StockBatch, 'batch_number'>): string {
  return batch.batch_number ?? 'No batch number';
}

/** Expired batches cannot leave the store. */
export function isUsable(batch: Pick<StockBatch, 'band'>): boolean {
  return batch.band !== 'expired';
}
