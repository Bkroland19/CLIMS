import { describe, expect, it } from 'vitest';

import { covers, formatQuantities, parsePieces, sumQuantities } from './products';

describe('parsePieces', () => {
  it.each([
    ['0', 0],
    ['800', 800],
    ['1,500', 1500],
    [' 2 000 ', 2000],
  ])('reads %j as %d', (text, expected) => {
    expect(parsePieces(text)).toBe(expected);
  });

  it.each(['', '-5', '12.5', '1e3', 'abc', '99999999999999999999'])('refuses %j', (text) => {
    expect(parsePieces(text)).toBeNull();
  });
});

describe('quantities', () => {
  it('summarises only the products with pieces', () => {
    expect(formatQuantities({ male: 1500, female: 0 })).toBe('Male 1,500');
    expect(formatQuantities({ male: 0, female: 0 })).toBe('—');
    expect(formatQuantities(null)).toBe('—');
  });

  it('adds up and compares', () => {
    const total = sumQuantities([
      { male: 100, female: 10 },
      { male: 50, female: 0 },
    ]);
    expect(total).toEqual({ male: 150, female: 10 });
    expect(covers(total, { male: 150, female: 10 })).toBe(true);
    expect(covers(total, { male: 151, female: 0 })).toBe(false);
  });
});
