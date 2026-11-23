import { describe, expect, it } from 'vitest';

import type { Movement } from '@/features/inventory/api';
import { aStockBatch } from '@/test/warehouseOrderFixtures';

import {
  adjustmentNote,
  batchFilterFrom,
  checkAdjustment,
  keepsBatch,
  movementBatch,
  signed,
} from './stock';

describe('batch filters', () => {
  it('keeps the batches of the band in the address', () => {
    expect(batchFilterFrom('under_1_month')).toBe('under_1_month');
    expect(batchFilterFrom('soon')).toBe('all');
    expect(keepsBatch('expired', aStockBatch({ band: 'expired' }))).toBe(true);
    expect(keepsBatch('expired', aStockBatch({ band: 'ok' }))).toBe(false);
    expect(keepsBatch('all', aStockBatch({ band: 'ok' }))).toBe(true);
  });
});

describe('checkAdjustment', () => {
  it('records a count as the difference from what is held', () => {
    expect(checkAdjustment('count', ' 480 ', 500)).toEqual({ quantity: -20, error: null });
    expect(checkAdjustment('count', '520', 500)).toEqual({ quantity: 20, error: null });
    expect(checkAdjustment('count', '500', 500).error).toMatch(/nothing to correct/);
  });

  it('takes damaged, expired or lost stock away, up to what the batch holds', () => {
    expect(checkAdjustment('damaged', '12', 500)).toEqual({ quantity: -12, error: null });
    expect(checkAdjustment('lost', '0', 500).error).toBe('Enter how many, as a whole number.');
    expect(checkAdjustment('expired', '501', 500).error).toBe('The batch holds only 500.');
    expect(checkAdjustment('damaged', '1.5', 500).quantity).toBeNull();
  });
});

describe('ledger words', () => {
  it('signs changes and names the batch', () => {
    expect(signed(1200)).toBe('+1,200');
    expect(signed(-40)).toBe('−40');
    const movement = (overrides: Partial<Movement>) =>
      ({ reason: 'receipt', batch_number: null, ...overrides }) as Movement;
    expect(movementBatch(movement({ batch_number: 'FC2-1' }))).toBe('FC2-1');
    expect(movementBatch(movement({}))).toBe('No batch number');
    expect(movementBatch(movement({ reason: 'dispatch' }))).toBeNull();
    expect(adjustmentNote('damaged', '  Water in bay 4 ')).toBe('Damaged: Water in bay 4');
  });
});
