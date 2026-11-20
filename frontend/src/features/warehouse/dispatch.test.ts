import { describe, expect, it } from 'vitest';

import { pickKey } from '@/features/fulfilment/picking';

import type { WarehouseBatch } from './api';
import { checkRequestStock, dispatchableStock, planDispatch, productStock } from './dispatch';

const NOW = new Date('2026-11-20T09:00:00Z');

const batch = (
  product: 'male' | 'female',
  name: string,
  expires_on: string,
  quantity: number,
): WarehouseBatch => ({
  product,
  batch: name,
  manufactured_on: '2024-01-01',
  expires_on,
  quantity,
});

const BATCHES: WarehouseBatch[] = [
  batch('male', 'ENG-EXPIRED', '2026-10-01', 5000),
  batch('male', 'ENG-NEAR', '2027-01-10', 2000),
  batch('male', 'ENG-SHORT', '2027-04-01', 3000),
  batch('male', 'ENG-LATE', '2029-08-31', 6000),
  batch('male', 'ENG-EARLY', '2028-01-31', 4000),
  batch('female', 'FC2-OK', '2029-07-31', 300),
];

describe('dispatchableStock', () => {
  it('counts only batches with at least six months of shelf life', () => {
    expect(dispatchableStock(BATCHES, NOW)).toEqual({ male: 10000, female: 300 });
  });
});

describe('checkRequestStock', () => {
  it('is available when every product needed is covered by dispatchable stock', () => {
    const check = checkRequestStock({ male: 10000, female: 0 }, BATCHES, NOW);
    expect(check.isAvailable).toBe(true);
    expect(check.checks.male).toEqual({ status: 'available' });
    expect(check.checks.female).toEqual({ status: 'not-needed' });
  });

  it('does not count expired or short-dated batches towards the check', () => {
    const check = checkRequestStock({ male: 12000, female: 400 }, BATCHES, NOW);
    expect(check.isAvailable).toBe(false);
    expect(check.checks.male).toEqual({ status: 'short', shortBy: 2000 });
    expect(check.checks.female).toEqual({ status: 'short', shortBy: 100 });
  });

  it('is not available when nothing is needed at all', () => {
    expect(checkRequestStock({ male: 0, female: 0 }, BATCHES, NOW).isAvailable).toBe(false);
  });
});

describe('planDispatch', () => {
  it('suggests first-expiry-first-out from dispatchable batches only', () => {
    const plan = planDispatch(BATCHES, { male: 7000, female: 0 }, {}, NOW);
    expect(plan.lines).toEqual([
      { product: 'male', batch: 'ENG-EARLY', quantity: 4000 },
      { product: 'male', batch: 'ENG-LATE', quantity: 3000 },
    ]);
    expect(plan.problems).toEqual([]);
    expect(plan.isPartial).toBe(false);
    const [male] = plan.groups;
    expect(male?.lots.map((lot) => lot.batch.batch)).toEqual([
      'ENG-EXPIRED',
      'ENG-NEAR',
      'ENG-SHORT',
      'ENG-EARLY',
      'ENG-LATE',
    ]);
    expect(male?.lots.find((lot) => lot.isFirstOut)?.batch.batch).toBe('ENG-EARLY');
    expect(male?.lots[0]).toMatchObject({ canPick: false, text: '', taking: 0 });
  });

  it('lets a short-dated batch be picked by hand, and counts it as flagged', () => {
    const entries = {
      [pickKey('male', 'ENG-NEAR', 1000)]: '1000',
      [pickKey('male', 'ENG-EARLY', 1000)]: '0',
    };
    const plan = planDispatch(BATCHES, { male: 1000, female: 0 }, entries, NOW);
    expect(plan.lines).toEqual([{ product: 'male', batch: 'ENG-NEAR', quantity: 1000 }]);
    expect(plan.groups[0]?.flaggedPieces).toBe(1000);
    expect(plan.problems).toEqual([]);
  });

  it('allows picking less than requested, and says so', () => {
    const entries = { [pickKey('male', 'ENG-EARLY', 5000)]: '2,500' };
    const plan = planDispatch(BATCHES, { male: 5000, female: 0 }, entries, NOW);
    expect(plan.isPartial).toBe(true);
    expect(plan.problems).toEqual([]);
    expect(plan.lines).toContainEqual({ product: 'male', batch: 'ENG-EARLY', quantity: 2500 });
  });

  it('refuses more than requested, more than a batch holds, and text that is not a number', () => {
    const need = 1000;
    expect(
      planDispatch(
        BATCHES,
        { male: need, female: 0 },
        { [pickKey('male', 'ENG-LATE', need)]: '500' },
        NOW,
      ).problems,
    ).toEqual(['Male condoms: picking 1,500, more than the 1,000 requested']);
    expect(
      planDispatch(
        BATCHES,
        { male: need, female: 0 },
        { [pickKey('male', 'ENG-EARLY', need)]: '4001' },
        NOW,
      ).problems,
    ).toEqual(['Male condoms: check the highlighted batches']);
    const plan = planDispatch(
      BATCHES,
      { male: need, female: 0 },
      { [pickKey('male', 'ENG-EARLY', need)]: 'lots' },
      NOW,
    );
    expect(plan.groups[0]?.lots.find((lot) => lot.batch.batch === 'ENG-EARLY')?.error).toBe(
      'not-a-number',
    );
  });

  it('needs at least one batch picked', () => {
    const entries = { [pickKey('female', 'FC2-OK', 100)]: '0' };
    expect(planDispatch(BATCHES, { male: 0, female: 100 }, entries, NOW).problems).toEqual([
      'Pick at least one batch',
    ]);
  });
});

describe('productStock', () => {
  it('splits each product by shelf life and finds the next expiry', () => {
    const [male, female] = productStock(BATCHES, NOW);
    expect(male).toEqual({
      product: 'male',
      total: 20000,
      dispatchable: 10000,
      flagged: 5000,
      expired: 5000,
      nextExpiry: '2026-10-01',
    });
    expect(female).toMatchObject({ total: 300, dispatchable: 300, nextExpiry: '2029-07-31' });
  });
});
