import { describe, expect, it } from 'vitest';

import { aBalance, aStockout, FEMALE, UNITLESS } from '@/test/dcfpFixtures';

import {
  deliverableProducts,
  deliveryLineErrors,
  missingCategories,
  stockoutEventLabel,
  stockoutSteps,
  type DeliverableProduct,
} from './stockouts';

const MALE = {
  ...FEMALE,
  id: 'p-male',
  category: 'male' as const,
  brand: { id: 'b3', name: 'Trust' },
};

describe('deliverableProducts', () => {
  it('offers active, countable products of the category asked for, in stock first', () => {
    const inactive = { ...FEMALE, id: 'p-old', active: false };
    const empty = { ...FEMALE, id: 'p-empty', brand: { id: 'b4', name: 'Aaa' } };
    const rows = deliverableProducts([FEMALE, MALE, UNITLESS, inactive, empty], 'female', [
      aBalance(),
    ]);
    expect(rows.map((row) => [row.id, row.available])).toEqual([
      [FEMALE.id, 10],
      ['p-empty', 0],
    ]);
  });

  it('offers both categories for a report of both', () => {
    expect(deliverableProducts([FEMALE, MALE], 'both', []).map((row) => row.id)).toHaveLength(2);
  });

  it('leaves availability unknown when the store’s stock could not be read', () => {
    expect(deliverableProducts([FEMALE], 'female', null)[0]?.available).toBeNull();
  });

  it('ignores a balance kept in another unit', () => {
    const rows = deliverableProducts([FEMALE], 'female', [
      aBalance({ unit_of_measure_id: 'u-carton' }),
    ]);
    expect(rows[0]?.available).toBe(0);
  });
});

describe('deliveryLineErrors', () => {
  const products: DeliverableProduct[] = [
    { id: 'a', name: 'A', category: 'female', unit: 'box', piecesPerUnit: 100, available: 5 },
    { id: 'b', name: 'B', category: 'male', unit: 'box', piecesPerUnit: 144, available: null },
  ];
  const line = (productId: string, quantity: string) => ({
    key: productId + quantity,
    productId,
    quantity,
  });

  it.each([
    ['', '1', { productId: 'Choose a product.' }],
    ['a', '', { quantity: 'Enter a whole number of at least 1.' }],
    ['a', '0', { quantity: 'Enter a whole number of at least 1.' }],
    ['a', '1.5', { quantity: 'Enter a whole number of at least 1.' }],
    ['a', '6', { quantity: 'The district store has 5 available.' }],
    ['b', '1000001', { quantity: 'Enter at most 1,000,000.' }],
    ['b', '900', {}],
    ['a', '5', {}],
  ])('product %j, quantity %j', (productId, quantity, expected) => {
    expect(deliveryLineErrors([line(productId, quantity)], products)).toEqual([expected]);
  });

  it('says when the store has none', () => {
    expect(
      deliveryLineErrors([line('a', '1')], [{ ...products[0]!, available: 0 }])[0]?.quantity,
    ).toBe('The district store has none of this product.');
  });

  it('allows each product on one line only', () => {
    expect(deliveryLineErrors([line('a', '1'), line('a', '2')], products)[1]).toEqual({
      productId: 'This product is already on another line.',
    });
  });
});

describe('missingCategories', () => {
  const products: DeliverableProduct[] = [
    { id: 'a', name: 'A', category: 'female', unit: 'box', piecesPerUnit: 100, available: 5 },
  ];
  it('lists what a delivery leaves out of what was asked for', () => {
    expect(
      missingCategories('both', [{ key: '1', productId: 'a', quantity: '1' }], products),
    ).toEqual(['male']);
    expect(
      missingCategories('female', [{ key: '1', productId: 'a', quantity: '1' }], products),
    ).toEqual([]);
  });
});

describe('stockoutSteps', () => {
  const states = (report: Parameters<typeof stockoutSteps>[0]) =>
    stockoutSteps(report).map((step) => step.state);
  it('follows the report from reported to confirmed', () => {
    expect(states(aStockout())).toEqual(['done', 'current', 'upcoming']);
    const sent = aStockout({
      status: 'awaiting_acknowledgement',
      deliveries: [{ id: 'd', delivered_by_id: 'u', note: null, created_at: '', lines: [] }],
    });
    expect(states(sent)).toEqual(['done', 'done', 'current']);
    expect(states({ ...sent, status: 'partly_received' })).toEqual(['done', 'done', 'attention']);
    expect(states({ ...sent, status: 'fulfilled' })).toEqual(['done', 'done', 'done']);
  });
});

describe('stockoutEventLabel', () => {
  it('names each step', () => {
    expect(stockoutEventLabel({ action: 'raised', selection: 'both' })).toBe(
      'Reported out of male and female condoms',
    );
    expect(stockoutEventLabel({ action: 'selection_changed', selection: 'both' })).toBe(
      'Now asking for male and female condoms',
    );
    expect(stockoutEventLabel({ action: 'delivered', selection: 'female' })).toBe(
      'Stock sent from the district store',
    );
  });
});
