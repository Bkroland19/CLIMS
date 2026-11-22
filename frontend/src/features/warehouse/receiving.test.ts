import { describe, expect, it } from 'vitest';

import { checkDelivery, ugandaToday, type DeliveryFields } from './receiving';

const valid: DeliveryFields = {
  productId: 'p1',
  unitId: 'u1',
  batchNumber: ' FC2-2502-118 ',
  expiryDate: '2028-06-30',
  quantity: '600',
};

describe('checkDelivery', () => {
  it('accepts a batch with its number, expiry and quantity', () => {
    expect(checkDelivery(valid, '2026-11-22')).toEqual({
      errors: {},
      quantity: 600,
      shortShelf: false,
    });
  });

  it('names what is missing or wrong, by field', () => {
    const { errors } = checkDelivery(
      { productId: '', unitId: '', batchNumber: ' ', expiryDate: '', quantity: '0' },
      '2026-11-22',
    );
    expect(Object.keys(errors).sort()).toEqual([
      'batchNumber',
      'expiryDate',
      'productId',
      'quantity',
      'unitId',
    ]);
    expect(
      checkDelivery({ ...valid, expiryDate: '2026-11-22' }, '2026-11-22').errors.expiryDate,
    ).toMatch(/expired/);
  });

  it('warns about a batch arriving with under six months left', () => {
    expect(checkDelivery({ ...valid, expiryDate: '2027-05-21' }, '2026-11-22').shortShelf).toBe(
      true,
    );
    expect(checkDelivery({ ...valid, expiryDate: '2027-05-22' }, '2026-11-22').shortShelf).toBe(
      false,
    );
  });
});

describe('ugandaToday', () => {
  it('counts the day in Uganda, three hours ahead of UTC', () => {
    expect(ugandaToday(new Date('2026-11-21T21:30:00Z'))).toBe('2026-11-22');
    expect(ugandaToday(new Date('2026-11-21T20:30:00Z'))).toBe('2026-11-21');
  });
});
