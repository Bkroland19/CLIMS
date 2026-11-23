import { describe, expect, it } from 'vitest';

import { FEMALE, UNITLESS } from '@/test/dcfpFixtures';
import { aBalance, aStockBatch, FEMALE_FC2 } from '@/test/warehouseOrderFixtures';

import {
  checkDispatch,
  dispatchables,
  dispatchTotals,
  type DispatchLine,
} from './districtDispatch';

const batches = [
  aStockBatch({ id: 'gone', batch_number: 'EXP-1', band: 'expired', on_hand: 100 }),
  aStockBatch({ id: 'near', batch_number: 'NEAR-1', band: 'under_1_month', on_hand: 50 }),
  aStockBatch({ id: 'late', batch_number: 'LATE-1', band: 'ok', on_hand: 650 }),
];
// 800 on hand: 100 expired and 200 reserved for district orders leave 500 free.
const balances = [aBalance({ on_hand: 800, reserved: 200 })];

describe('dispatchables', () => {
  it('lists active products with free stock in their catalogue unit', () => {
    const items = dispatchables(
      [FEMALE, FEMALE_FC2, UNITLESS, { ...FEMALE, id: 'p-off', active: false }],
      [...balances, aBalance({ condom_id: UNITLESS.id })],
      batches,
    );
    // FC2 has no stock, the unitless product has no catalogue unit, the inactive one cannot go.
    expect(items.map((item) => [item.product.id, item.free, item.unit])).toEqual([
      ['p-female', 500, 'box'],
    ]);
    expect(items[0]?.label).toBe('Engabu · Female · Free, box of 100');
    expect(items[0]?.batches.map((batch) => batch.id)).toEqual(['gone', 'near', 'late']);
  });

  it('leaves out stock held in another unit', () => {
    expect(dispatchables([FEMALE], [aBalance({ unit_of_measure_id: 'u-carton' })], [])).toEqual([]);
  });
});

describe('checkDispatch', () => {
  const [female] = dispatchables([FEMALE], balances, batches);
  const byId = new Map(female ? [[female.product.id, female]] : []);
  const line = (overrides: Partial<DispatchLine>): DispatchLine => ({
    key: 0,
    productId: FEMALE.id,
    quantity: '20',
    ...overrides,
  });

  it('plans the batches first expiry first, and flags those with under a month left', () => {
    const check = checkDispatch([line({ quantity: '120' })], byId);
    expect(check.valid).toBe(true);
    expect(check.lines[0]?.plan?.takes.map((take) => [take.batch.id, take.quantity])).toEqual([
      ['near', 50],
      ['late', 70],
    ]);
    expect(check.nearExpiry.map((take) => take.batch.id)).toEqual(['near']);
  });

  it('refuses more than the free stock, a missing product, a repeat and a bad count', () => {
    const check = checkDispatch(
      [
        line({ key: 1, quantity: '501' }),
        line({ key: 2, productId: '' }),
        line({ key: 3, quantity: '5' }),
        line({ key: 4, quantity: '2.5' }),
      ],
      byId,
    );
    expect(check.valid).toBe(false);
    expect(check.lines.map((lineCheck) => lineCheck.errors)).toEqual([
      { quantity: 'Free to dispatch: 500 box. Enter that or less.' },
      { productId: 'Choose a product.' },
      { productId: 'This product is already on line 1. Put its whole quantity there.' },
      {
        productId: 'This product is already on line 1. Put its whole quantity there.',
        quantity: 'Enter how many to dispatch, as a whole number.',
      },
    ]);
    // A line over the free stock plans nothing, so it asks for no exception.
    expect(check.lines[0]?.plan).toBeNull();
  });

  it('totals the valid quantities per unit', () => {
    const lines = [line({ key: 1, quantity: '30' }), line({ key: 2, productId: '' })];
    const check = checkDispatch(lines, byId);
    expect(dispatchTotals(lines, check.lines, byId)).toEqual([{ unit: 'box', quantity: 30 }]);
  });
});
