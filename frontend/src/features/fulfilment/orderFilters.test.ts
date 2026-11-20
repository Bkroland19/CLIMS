import { describe, expect, it } from 'vitest';

import { anOrder } from '@/test/fulfilmentFixtures';

import { filterFrom, ORDER_FILTERS } from './orderFilters';

describe('order filters', () => {
  it('reads the status filter from the address, falling back to all', () => {
    expect(filterFrom(ORDER_FILTERS, 'on_hold').value).toBe('on_hold');
    expect(filterFrom(ORDER_FILTERS, 'nonsense').value).toBe('all');
    expect(filterFrom(ORDER_FILTERS, null).value).toBe('all');
  });

  it('keeps the orders each filter names', () => {
    const delivery = filterFrom(ORDER_FILTERS, 'delivery');
    expect(delivery.keeps(anOrder({ status: 'in_transit' }))).toBe(true);
    expect(delivery.keeps(anOrder({ status: 'received' }))).toBe(false);

    const closed = filterFrom(ORDER_FILTERS, 'closed');
    expect(closed.keeps(anOrder({ status: 'received' }))).toBe(true);
    expect(closed.keeps(anOrder({ status: 'queued' }))).toBe(false);
  });
});
