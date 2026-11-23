import { describe, expect, it } from 'vitest';

import type { Movement } from '@/features/inventory/api';
import { aStockBatch } from '@/test/warehouseOrderFixtures';

import {
  adjustmentNote,
  batchFilterFrom,
  checkAdjustment,
  checkBatchEdit,
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

describe('checkBatchEdit', () => {
  const batch = aStockBatch({
    id: 'mine',
    batch_number: 'FC2-1',
    expiry_date: '2028-06-30',
    on_hand: 500,
  });
  const fields = { batchNumber: 'FC2-1', expiryDate: '2028-06-30', onHand: '500', note: 'Typo' };
  const today = '2026-11-23';

  it('sends nothing until something changes, and says why a field is refused', () => {
    expect(checkBatchEdit(fields, batch, [batch], today)).toMatchObject({
      errors: {},
      unchanged: true,
      delta: 0,
    });
    expect(
      checkBatchEdit(
        { batchNumber: ' ', expiryDate: '', onHand: '0', note: '' },
        batch,
        [batch],
        today,
      ).errors,
    ).toEqual({
      batchNumber: 'Enter the batch number printed on the cartons.',
      expiryDate: 'Enter the expiry date printed on the cartons.',
      onHand: 'Enter at least 1. To remove the whole batch, delete it instead.',
      note: 'Say why the batch is changing.',
    });
    expect(checkBatchEdit({ ...fields, onHand: '4.5' }, batch, [], today)).toMatchObject({
      delta: null,
      errors: { onHand: 'Enter the quantity on the shelf, as a whole number.' },
    });
  });

  it('works out the change in quantity, and warns of a date that has passed', () => {
    const check = checkBatchEdit(
      { ...fields, onHand: ' 480 ', expiryDate: '2026-11-01' },
      batch,
      [],
      today,
    );
    expect(check).toMatchObject({ errors: {}, unchanged: false, delta: -20, expired: true });
  });

  it('refuses a number the store holds under another expiry, and joins one it holds under this one', () => {
    const twin = aStockBatch({
      id: 'twin',
      batch_number: 'FC2-2',
      expiry_date: '2027-01-31',
      on_hand: 40,
    });
    const otherProduct = aStockBatch({ id: 'other', batch_number: 'FC2-3', condom_id: 'p2' });
    expect(
      checkBatchEdit({ ...fields, batchNumber: 'FC2-2' }, batch, [batch, twin], today).errors
        .batchNumber,
    ).toMatch(
      /^Batch FC2-2 is already held with expiry .*2027\. Use that date, or check the number\.$/,
    );
    expect(
      checkBatchEdit(
        { ...fields, batchNumber: 'FC2-2', expiryDate: '2027-01-31' },
        batch,
        [twin],
        today,
      ),
    ).toMatchObject({ errors: {}, joins: twin });
    expect(
      checkBatchEdit({ ...fields, batchNumber: 'FC2-3' }, batch, [otherProduct], today),
    ).toMatchObject({ errors: {}, joins: null });
  });
});
