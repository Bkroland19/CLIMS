import { describe, expect, it } from 'vitest';

import { aStore } from '@/test/fulfilmentFixtures';

import { pickKey, planPicks } from './picking';

const now = new Date('2026-11-19T09:00:00Z');
const { batches } = aStore();

describe('planPicks', () => {
  it('suggests first-expiry-first-out and flags the batch to use first', () => {
    const plan = planPicks(batches, { male: 800, female: 40 }, {}, now);

    expect(plan.lines).toEqual([
      { product: 'male', batch: 'ENG-2206-021', quantity: 400 },
      { product: 'male', batch: 'ENG-2407-088', quantity: 400 },
      { product: 'female', batch: 'FC2-2405-031', quantity: 40 },
    ]);
    expect(plan.problems).toEqual([]);
    const male = plan.groups[0];
    expect(male?.lots[0]).toMatchObject({ isFirstOut: true, isNearExpiry: true, text: '400' });
    expect(male?.nearExpiryPieces).toBe(400);
  });

  it('leaves out products that are not needed', () => {
    const plan = planPicks(batches, { male: 100, female: 0 }, {}, now);
    expect(plan.groups.map((group) => group.product)).toEqual(['male']);
  });

  it('uses what was typed, and says when the picks do not add up', () => {
    const plan = planPicks(
      batches,
      { male: 800, female: 0 },
      { [pickKey('male', 'ENG-2206-021', 800)]: '0' },
      now,
    );
    expect(plan.lines).toEqual([{ product: 'male', batch: 'ENG-2407-088', quantity: 400 }]);
    expect(plan.problems).toEqual(['Male condoms: picking 400 of 800']);
  });

  it('refuses more than a batch holds, or text that is not a number', () => {
    const over = planPicks(
      batches,
      { male: 800, female: 0 },
      { [pickKey('male', 'ENG-2206-021', 800)]: '500' },
      now,
    );
    expect(over.groups[0]?.lots[0]?.error).toBe('more-than-available');
    expect(over.problems).toEqual(['Male condoms: check the highlighted batches']);

    const typo = planPicks(
      batches,
      { male: 800, female: 0 },
      { [pickKey('male', 'ENG-2206-021', 800)]: '4o0' },
      now,
    );
    expect(typo.groups[0]?.lots[0]?.error).toBe('not-a-number');
  });

  it('never issues from an expired batch', () => {
    const expired = [
      {
        ...batches[0],
        product: 'male' as const,
        batch: 'OLD',
        expires_on: '2026-01-31',
        quantity: 900,
        manufactured_on: '2021-01-01',
      },
      ...batches,
    ];
    const plan = planPicks(expired, { male: 100, female: 0 }, {}, now);
    expect(plan.groups[0]?.lots[0]).toMatchObject({ canIssue: false, text: '', taking: 0 });
    expect(plan.lines).toEqual([{ product: 'male', batch: 'ENG-2206-021', quantity: 100 }]);
  });
});
