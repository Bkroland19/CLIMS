import { describe, expect, it } from 'vitest';

import { ledgerFilterFrom, ledgerHref, movementOrderHref, signedChange } from './ledger';

const filterOf = (query: string) => ledgerFilterFrom(new URLSearchParams(query));

describe('ledger filter in the address', () => {
  it('reads a reason, a date range and a page counted from 1', () => {
    expect(filterOf('reason=adjustment&from=2026-11-01&to=2026-11-21&page=3')).toEqual({
      reason: 'adjustment',
      from: '2026-11-01',
      to: '2026-11-21',
      page: 2,
    });
  });

  it('leaves out what it cannot read, and an end before the start', () => {
    expect(filterOf('reason=stolen&from=21/11/2026&page=-2')).toEqual({
      reason: null,
      from: null,
      to: null,
      page: 0,
    });
    expect(filterOf('from=2026-11-21&to=2026-11-01')).toMatchObject({
      from: '2026-11-21',
      to: null,
    });
  });

  it('writes the same filter back', () => {
    expect(ledgerHref({ reason: 'receipt', from: '2026-11-01', to: null, page: 1 })).toBe(
      '/dcfp/restock/store?reason=receipt&from=2026-11-01&page=2',
    );
    expect(ledgerHref({ reason: null, from: null, to: null, page: 0 })).toBe('/dcfp/restock/store');
  });
});

describe('movementOrderHref', () => {
  it('links stock sent to its alert and stock received to its request', () => {
    expect(movementOrderHref('dispatch', 'a1')).toBe('/dcfp/orders/a1');
    expect(movementOrderHref('order_receipt', 'r1')).toBe('/dcfp/restock/r1');
    expect(movementOrderHref('adjustment', null)).toBeNull();
  });
});

describe('signedChange', () => {
  it('signs a change in text', () => {
    expect(signedChange(40, String)).toBe('+40');
    expect(signedChange(-4, String)).toBe('−4');
    expect(signedChange(0, String)).toBe('0');
  });
});
