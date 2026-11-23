import { describe, expect, it } from 'vitest';

import { aProductSummary, aStockBatch } from '@/test/warehouseOrderFixtures';

import { bandAcrossUnits, shelfLifeByUnit, stockAttention } from './shelfLife';

const href = (path: string) => `${path}${path.includes('?') ? '&' : '?'}store=NMS`;

describe('shelfLifeByUnit', () => {
  it('splits each unit by band, never adding units together, the largest unit first', () => {
    const units = shelfLifeByUnit([
      aStockBatch({ id: '1', unit: 'box', band: 'ok', on_hand: 500 }),
      aStockBatch({ id: '2', unit: 'box', band: 'expired', on_hand: 40 }),
      aStockBatch({ id: '3', unit: 'carton', band: 'unknown', on_hand: 900 }),
      aStockBatch({ id: '4', unit: 'box', band: 'ok', on_hand: 60 }),
      aStockBatch({ id: '5', unit: 'box', band: 'under_1_month', on_hand: 0 }),
    ]);

    expect(units.map((unit) => [unit.unit, unit.total, unit.batches])).toEqual([
      ['carton', 900, 1],
      ['box', 600, 3],
    ]);
    const box = units[1];
    expect(box?.bands.map((share) => share.band)).toEqual([
      'expired',
      'under_1_month',
      'under_3_months',
      'under_6_months',
      'ok',
      'unknown',
    ]);
    expect(box?.bands.find((share) => share.band === 'ok')).toEqual({
      band: 'ok',
      quantity: 560,
      batches: 2,
    });
    // An empty batch holds nothing, so it is not counted.
    expect(box?.bands.find((share) => share.band === 'under_1_month')?.batches).toBe(0);
  });

  it('reads one band across units', () => {
    const units = shelfLifeByUnit([
      aStockBatch({ id: '1', unit: 'box', band: 'expired', on_hand: 40 }),
      aStockBatch({ id: '2', unit: 'carton', band: 'expired', on_hand: 3 }),
    ]);
    expect(bandAcrossUnits(units, 'expired')).toEqual({
      amounts: [
        { unit: 'box', quantity: 40 },
        { unit: 'carton', quantity: 3 },
      ],
      batches: 2,
    });
    expect(bandAcrossUnits(units, 'ok')).toEqual({ amounts: [], batches: 0 });
  });
});

describe('stockAttention', () => {
  it('lists write-offs, batches leaving within a month, undated stock and low stock, in that order', () => {
    const tasks = stockAttention(
      [
        aStockBatch({
          id: '1',
          band: 'under_1_month',
          batch_number: 'B-LATE',
          expiry_date: '2026-12-20',
        }),
        aStockBatch({
          id: '2',
          band: 'under_1_month',
          batch_number: 'B-SOON',
          expiry_date: '2026-12-01',
        }),
        aStockBatch({ id: '3', band: 'expired', on_hand: 40 }),
        aStockBatch({
          id: '4',
          band: 'unknown',
          batch_number: null,
          expiry_date: null,
          on_hand: 210,
        }),
      ],
      [
        aProductSummary({ product: 'Plenty', usable: 900, dispatched_90_days: 300 }),
        aProductSummary({ product: 'Short', usable: 50, dispatched_90_days: 300 }),
      ],
      href,
    );

    expect(tasks.map((task) => task.id)).toEqual(['expired', 'under_1_month', 'unknown', 'cover']);
    expect(tasks[0]).toMatchObject({
      title: 'Write off 1 batch',
      href: '/warehouse/stock?view=batches&band=expired&store=NMS',
    });
    expect(tasks[0]?.detail).toContain('40 box past expiry');
    expect(tasks[1]?.title).toBe('2 batches expire within a month');
    expect(tasks[1]?.detail).toContain('First: B-SOON');
    expect(tasks[2]?.title).toBe('Record expiry dates for 1 batch');
    expect(tasks[3]?.title).toBe('1 product has under a month of stock');
    expect(tasks[3]?.detail).toContain('Lowest: Short (box)');
  });

  it('has nothing to say about healthy stock', () => {
    expect(
      stockAttention(
        [aStockBatch({ band: 'ok' }), aStockBatch({ id: 'x', band: 'expired', on_hand: 0 })],
        [aProductSummary({ usable: 900, dispatched_90_days: 0 })],
        href,
      ),
    ).toEqual([]);
  });
});
