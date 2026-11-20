import { describe, expect, it } from 'vitest';

import { DISPATCH_DETAILS } from '@/test/fulfilmentFixtures';

import {
  defaultDiscrepancyType,
  discrepancySummary,
  formatDifference,
  receiptInput,
  receiptRows,
  rowDiffers,
  suggestedRequest,
} from './restock';

const lines = DISPATCH_DETAILS.lines;

describe('suggestedRequest', () => {
  const minimum = { male: 5000, female: 300 };

  it('covers the held orders and the minimum level, in whole cartons', () => {
    const demand = { male: 2500, female: 100 };
    const stock = { male: 1400, female: 60 };
    expect(suggestedRequest(demand, stock, minimum)).toEqual({ male: 7000, female: 400 });
  });

  it('asks for nothing when the store already covers everything', () => {
    const stock = { male: 9000, female: 500 };
    expect(suggestedRequest({ male: 0, female: 0 }, stock, minimum)).toEqual({
      male: 0,
      female: 0,
    });
  });
});

describe('receiptRows', () => {
  it('starts every line as counted in full and intact', () => {
    const rows = receiptRows(lines, []);
    expect(rows.map((row) => [row.countedText, row.condition, row.accepted])).toEqual([
      ['6000', 'Intact', 6000],
      ['300', 'Intact', 300],
    ]);
    expect(rows.some(rowDiffers)).toBe(false);
    expect(receiptInput(rows)).toEqual([
      { product: 'male', batch: 'ENG-2409-117', counted: 6000, damaged: 0, condition: 'Intact' },
      { product: 'female', batch: 'FC2-2408-044', counted: 300, damaged: 0, condition: 'Intact' },
    ]);
  });

  it('accepts what was counted less what was damaged', () => {
    const [, female] = receiptRows(lines, [{}, { condition: 'Damaged', damaged: '20' }]);
    expect(female).toMatchObject({ accepted: 280, difference: 0, damagedError: null });
    expect(female && rowDiffers(female)).toBe(true);
  });

  it('ignores a damaged count once the condition is no longer Damaged', () => {
    const [male] = receiptRows(lines, [{ condition: 'Intact', damaged: '50' }]);
    expect(male).toMatchObject({ damaged: 0, accepted: 6000 });
  });

  it('flags counts that are not whole numbers, or more damaged than counted', () => {
    const rows = receiptRows(lines, [
      { counted: 'lots' },
      { counted: '10', condition: 'Damaged', damaged: '11' },
    ]);
    expect(rows[0]?.countedError).toBe('Enter a whole number');
    expect(rows[1]?.damagedError).toBe('More than counted');
    expect(receiptInput(rows)).toBeNull();
  });
});

describe('defaultDiscrepancyType', () => {
  it.each([
    [
      [{ condition: 'Batch or expiry differs' as const }, { counted: '200' }],
      'Wrong batch or expiry',
    ],
    [[{ counted: '5800' }], 'Short delivery'],
    [[{ counted: '6200' }], 'Excess delivery'],
    [[{ condition: 'Damaged' as const, damaged: '5' }], 'Damaged or expired'],
  ])('suggests the most specific type for %j', (entries, expected) => {
    expect(defaultDiscrepancyType(receiptRows(lines, entries))).toBe(expected);
  });
});

describe('discrepancySummary', () => {
  it('says what differs on each line that differs', () => {
    const rows = receiptRows(lines, [{ counted: '5800' }, { condition: 'Damaged', damaged: '20' }]);
    expect(discrepancySummary(rows)).toBe(
      'ENG-2409-117: −200 against the waybill · FC2-2408-044: 20 damaged',
    );
  });
});

describe('formatDifference', () => {
  it('signs a difference with a true minus sign', () => {
    expect(formatDifference(0)).toBe('0');
    expect(formatDifference(1200)).toBe('+1,200');
    expect(formatDifference(-200)).toBe('−200');
  });
});
