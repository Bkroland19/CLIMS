import { describe, expect, it } from 'vitest';

import { canIssue, expiryOf, suggestPicks, type BatchStock } from './batches';

const now = new Date(Date.UTC(2026, 10, 19, 8, 0));

describe('expiryOf', () => {
  it.each([
    ['2026-11-01', 'expired', 'Expired'],
    ['2026-12-01', 'near', '12 days left'],
    ['2027-01-31', 'near', '2 months left'],
    ['2027-04-30', 'short', '5 months left'],
    ['2029-06-30', 'ok', '31 months left'],
  ])('rates a batch expiring %s as %s (%s)', (expiresOn, state, left) => {
    expect(expiryOf(expiresOn, now)).toEqual({ state, left });
  });

  it('treats the expiry day itself as expired from its first moment', () => {
    expect(canIssue('2026-11-19', now)).toBe(false);
    expect(canIssue('2026-11-20', now)).toBe(true);
  });
});

describe('suggestPicks', () => {
  const batches: BatchStock[] = [
    { product: 'male', batch: 'LATE', expires_on: '2029-06-30', quantity: 1000 },
    { product: 'male', batch: 'SOON', expires_on: '2027-01-31', quantity: 400 },
    { product: 'male', batch: 'GONE', expires_on: '2026-10-01', quantity: 900 },
    { product: 'female', batch: 'FC2', expires_on: '2029-04-30', quantity: 60 },
  ];

  it('takes the earliest-expiring batch first and skips expired stock', () => {
    expect(suggestPicks(batches, 'male', 800, now)).toEqual({
      picks: [
        { product: 'male', batch: 'SOON', quantity: 400 },
        { product: 'male', batch: 'LATE', quantity: 400 },
      ],
      short: 0,
    });
  });

  it('reports what the batches cannot cover', () => {
    expect(suggestPicks(batches, 'female', 100, now)).toEqual({
      picks: [{ product: 'female', batch: 'FC2', quantity: 60 }],
      short: 40,
    });
  });

  it('picks nothing for nothing needed', () => {
    expect(suggestPicks(batches, 'male', 0, now)).toEqual({ picks: [], short: 0 });
  });
});
