import { describe, expect, it } from 'vitest';

import { aStockBatch } from '@/test/warehouseOrderFixtures';

import { planDispatch, reservable } from './picking';

describe('planDispatch', () => {
  const batches = [
    aStockBatch({ id: 'gone', batch_number: 'EXP-1', band: 'expired', on_hand: 50 }),
    aStockBatch({ id: 'near', batch_number: 'NEAR-1', band: 'under_1_month', on_hand: 10 }),
    aStockBatch({ id: 'late', batch_number: 'LATE-1', band: 'ok', on_hand: 15 }),
    aStockBatch({
      id: 'none',
      batch_number: null,
      expiry_date: null,
      band: 'unknown',
      on_hand: 20,
    }),
  ];

  it('takes unexpired batches first expiry first, unknown expiry last', () => {
    const plan = planDispatch(batches, 30);
    expect(plan.takes.map((take) => [take.batch.id, take.quantity])).toEqual([
      ['near', 10],
      ['late', 15],
      ['none', 5],
    ]);
    expect(plan).toMatchObject({ total: 30, short: 0 });
    expect(plan.nearExpiry.map((take) => take.batch.id)).toEqual(['near']);
  });

  it('says how much unexpired stock is missing', () => {
    expect(planDispatch(batches, 60)).toMatchObject({ total: 45, short: 15 });
  });

  it('needs no exception when the near-expiry batch is not reached', () => {
    const later = batches.filter((batch) => batch.id !== 'near');
    expect(planDispatch(later, 10).nearExpiry).toEqual([]);
  });
});

describe('reservable', () => {
  it('leaves out reserved and expired stock', () => {
    const batches = [aStockBatch({ band: 'expired', on_hand: 5 }), aStockBatch({ on_hand: 45 })];
    expect(reservable({ on_hand: 50, reserved: 20 }, batches)).toBe(25);
    expect(reservable({ on_hand: 10, reserved: 20 }, batches)).toBe(0);
    expect(reservable(undefined, batches)).toBe(0);
  });
});
