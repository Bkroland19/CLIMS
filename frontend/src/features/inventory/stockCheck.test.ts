import { describe, expect, it } from 'vitest';

import { checkStock } from './stockCheck';

describe('checkStock', () => {
  it('is available when free stock covers the need exactly or more', () => {
    expect(checkStock(1200, 1200)).toEqual({ status: 'available' });
    expect(checkStock(1200, 5000)).toEqual({ status: 'available' });
  });

  it('says how much is missing when stock is short', () => {
    expect(checkStock(1200, 800)).toEqual({ status: 'short', shortBy: 400 });
  });

  it('counts negative or unknown free stock as none', () => {
    expect(checkStock(500, -20)).toEqual({ status: 'short', shortBy: 500 });
    expect(checkStock(500, Number.NaN)).toEqual({ status: 'short', shortBy: 500 });
  });

  it.each([0, -5, Number.NaN])('needs nothing when the need is %s', (needed) => {
    expect(checkStock(needed, 100)).toEqual({ status: 'not-needed' });
  });
});
