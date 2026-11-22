import { describe, expect, it } from 'vitest';

import {
  askSchema,
  parseWholeNumber,
  receiveSchema,
  sendSchema,
  stockSchema,
  toMovementInput,
  toReceiveInput,
} from './forms';

const messages = (result: {
  success: boolean;
  error?: { issues: { path: PropertyKey[]; message: string }[] };
}) =>
  Object.fromEntries(
    (result.error?.issues ?? []).map((issue) => [issue.path.join('.'), issue.message]),
  );

describe('parseWholeNumber', () => {
  it('reads digits with thousands separators', () => {
    expect(parseWholeNumber(' 1,200 ')).toBe(1200);
    expect(parseWholeNumber('1 200')).toBe(1200);
    expect(parseWholeNumber('0')).toBe(0);
  });

  it('refuses decimals, words and signs unless signed', () => {
    expect(parseWholeNumber('2.5')).toBeNull();
    expect(parseWholeNumber('ten')).toBeNull();
    expect(parseWholeNumber('')).toBeNull();
    expect(parseWholeNumber('-4')).toBeNull();
    expect(parseWholeNumber('-4', { signed: true })).toBe(-4);
    expect(parseWholeNumber('−4', { signed: true })).toBe(-4);
  });
});

describe('sendSchema', () => {
  const schema = sendSchema((unit) => (unit === 'box' ? 21 : null));

  it('needs a unit, a rider and a quantity the store has available', () => {
    expect(
      messages(schema.safeParse({ unit_of_measure_id: '', quantity: '', rider_id: '' })),
    ).toEqual({
      unit_of_measure_id: 'Choose the unit to send.',
      rider_id: 'Choose the rider who will deliver it.',
      quantity: 'Enter a whole number of at least 1.',
    });
    expect(
      messages(schema.safeParse({ unit_of_measure_id: 'box', quantity: '22', rider_id: 'r' })),
    ).toEqual({
      quantity:
        'The district store has 21 available in this unit. Send less, or ask the warehouse.',
    });
    expect(
      schema.safeParse({ unit_of_measure_id: 'box', quantity: '21', rider_id: 'r' }).success,
    ).toBe(true);
  });
});

describe('askSchema', () => {
  it('needs a warehouse, a unit and at least 1', () => {
    expect(
      messages(
        askSchema.safeParse({ warehouse_store_id: '', unit_of_measure_id: '', quantity: '0' }),
      ),
    ).toEqual({
      warehouse_store_id: 'Choose the warehouse to ask.',
      unit_of_measure_id: 'Choose the unit to ask for.',
      quantity: 'Enter a whole number of at least 1.',
    });
  });
});

describe('receiveSchema', () => {
  const schema = receiveSchema(30);

  it('takes the count sent without a note', () => {
    expect(schema.safeParse({ quantity_received: '30', discrepancy_note: '' }).success).toBe(true);
    expect(toReceiveInput({ quantity_received: '30', discrepancy_note: '  ' })).toEqual({
      quantity_received: 30,
      discrepancy_note: null,
    });
  });

  it('needs a note when the count differs, including nothing arriving', () => {
    expect(messages(schema.safeParse({ quantity_received: '28', discrepancy_note: ' ' }))).toEqual({
      discrepancy_note: '30 were sent. Say what happened to the difference.',
    });
    expect(
      schema.safeParse({ quantity_received: '0', discrepancy_note: 'Lost in transit.' }).success,
    ).toBe(true);
  });

  it('refuses a count that is not a whole number', () => {
    expect(messages(schema.safeParse({ quantity_received: '-1', discrepancy_note: '' }))).toEqual({
      quantity_received: 'Enter the whole number that arrived, or 0 if nothing did.',
    });
  });
});

describe('stockSchema', () => {
  const base = { condom_id: 'male', unit_of_measure_id: 'box', note: '' };

  it('takes a receipt of at least 1, with or without a note', () => {
    expect(stockSchema.safeParse({ ...base, reason: 'receipt', quantity: '40' }).success).toBe(
      true,
    );
    expect(messages(stockSchema.safeParse({ ...base, reason: 'receipt', quantity: '-4' }))).toEqual(
      {
        quantity: 'Enter how many arrived: a whole number of at least 1.',
      },
    );
  });

  it('takes a signed adjustment only with a note', () => {
    expect(
      messages(stockSchema.safeParse({ ...base, reason: 'adjustment', quantity: '-4' })),
    ).toEqual({
      note: 'Say why the stock changed, for example what the count found.',
    });
    expect(
      messages(
        stockSchema.safeParse({ ...base, reason: 'adjustment', quantity: '0', note: 'Count' }),
      ),
    ).toEqual({
      quantity: 'Enter the change: a whole number, negative to remove stock, for example −4.',
    });
    expect(
      toMovementInput('store', { ...base, reason: 'adjustment', quantity: '−4', note: ' Count. ' }),
    ).toEqual({
      store_id: 'store',
      condom_id: 'male',
      unit_of_measure_id: 'box',
      reason: 'adjustment',
      quantity: -4,
      note: 'Count.',
    });
  });

  it('caps the note at 1,000 characters', () => {
    expect(
      messages(
        stockSchema.safeParse({
          ...base,
          reason: 'receipt',
          quantity: '1',
          note: 'x'.repeat(1001),
        }),
      ),
    ).toEqual({ note: 'Use at most 1,000 characters.' });
  });
});
