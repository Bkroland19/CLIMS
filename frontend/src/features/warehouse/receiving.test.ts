import { describe, expect, it } from 'vitest';

import {
  checkDelivery,
  checkReceipt,
  lineOfError,
  ugandaToday,
  type DeliveryFields,
} from './receiving';

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

describe('checkReceipt', () => {
  it('accepts the same batch on two lines with the same expiry: two pallets of it', () => {
    const check = checkReceipt([valid, { ...valid, quantity: '40' }], '2026-11-22');
    expect(check.valid).toBe(true);
    expect(check.lines.map((line) => line.quantity)).toEqual([600, 40]);
  });

  it('refuses a batch given two expiry dates, naming the first line', () => {
    const check = checkReceipt([valid, { ...valid, expiryDate: '2029-01-31' }], '2026-11-22');
    expect(check.valid).toBe(false);
    expect(check.lines[1]?.errors.expiryDate).toBe(
      'Batch FC2-2502-118 is on line 1 with another expiry date.',
    );
    // The same number for another product is another batch.
    expect(
      checkReceipt([valid, { ...valid, productId: 'p2', expiryDate: '2029-01-31' }], '2026-11-22')
        .valid,
    ).toBe(true);
  });

  it('is invalid while any line is', () => {
    expect(checkReceipt([valid, { ...valid, quantity: '' }], '2026-11-22').valid).toBe(false);
  });
});

describe('lineOfError', () => {
  it("reads the line the API's message names", () => {
    expect(lineOfError('line 2: the batch holds less than the quantity to remove')).toEqual({
      index: 1,
      message: 'The batch holds less than the quantity to remove',
    });
    // Messages that name fields are put in the person's words.
    expect(lineOfError('line 1: batch_number and expiry_date are required')?.message).toBe(
      'Enter the batch number and expiry date.',
    );
    expect(lineOfError('a delivery needs between 1 and 50 lines')).toBeNull();
  });
});
