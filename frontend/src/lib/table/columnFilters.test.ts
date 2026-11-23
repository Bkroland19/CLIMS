import { describe, expect, it } from 'vitest';
import {
  describeFilter,
  emptyRule,
  filterDate,
  filterError,
  matchesFilter,
  type FilterRule,
} from './columnFilters';

describe('column filters', () => {
  it('matches text without case or accent differences and treats blanks explicitly', () => {
    expect(matchesFilter('Kabalé', { operator: 'contains', value: ' BALE ' })).toBe(true);
    expect(matchesFilter('Active', { operator: 'equals', value: 'active' })).toBe(true);
    expect(matchesFilter('Inactive', { operator: 'equals', value: 'active' })).toBe(false);
    expect(matchesFilter('Inactive', { operator: 'not_contains', value: 'active' })).toBe(false);
    expect(matchesFilter(' ', { operator: 'empty' })).toBe(true);
    expect(matchesFilter(null, { operator: 'contains', value: 'null' })).toBe(false);
    expect(matchesFilter(0, { operator: 'not_empty' })).toBe(true);
    expect(matchesFilter(null, { operator: 'not_empty' })).toBe(false);
  });
  it('ORs category choices and matches exact values', () => {
    const rule: FilterRule = { operator: 'one_of', values: ['Active', 'Pending'] };
    expect(matchesFilter('Active', rule)).toBe(true);
    expect(matchesFilter('Pending', rule)).toBe(true);
    expect(matchesFilter('Inactive', rule)).toBe(false);
  });
  it('supports inclusive numeric ranges, zero, negatives and one-sided bounds', () => {
    const range: FilterRule = { operator: 'number_range', from: '-2', to: '0' };
    expect([-3, -2, -1, 0, 1].filter((value) => matchesFilter(value, range))).toEqual([-2, -1, 0]);
    expect(matchesFilter(5, { operator: 'number_range', from: '5', to: '' })).toBe(true);
    expect(matchesFilter(0, { operator: 'number_range', from: '', to: '0' })).toBe(true);
    for (const value of [null, '', '5', Infinity, NaN])
      expect(matchesFilter(value, range)).toBe(false);
  });
  it('uses the Uganda calendar day for timestamps and preserves date-only values', () => {
    expect(filterDate('2026-11-22T21:30:00Z')).toBe('2026-11-23');
    expect(filterDate('2028-02-29')).toBe('2028-02-29');
    expect(filterDate('2027-02-29')).toBeNull();
    expect(filterDate('not a date')).toBeNull();
    const range: FilterRule = { operator: 'date_range', from: '2026-11-23', to: '2026-11-23' };
    expect(matchesFilter('2026-11-22T21:30:00Z', range)).toBe(true);
    expect(matchesFilter('2026-11-23T21:30:00Z', range)).toBe(false);
    expect(matchesFilter(null, range)).toBe(false);
  });
  it.each<FilterRule>([
    { operator: 'contains', value: ' ' },
    { operator: 'one_of', values: [] },
    { operator: 'number_range', from: '', to: '' },
    { operator: 'number_range', from: '6', to: '5' },
    { operator: 'number_range', from: 'Infinity', to: '' },
    { operator: 'number_range', from: '0x10', to: '' },
    { operator: 'date_range', from: '2027-02-30', to: '' },
    { operator: 'date_range', from: '2027-03-02', to: '2027-03-01' },
    { operator: 'date_range', from: '', to: '' },
  ])('rejects an invalid draft: %o', (rule) => {
    expect(filterError(rule)).not.toBeNull();
  });
  it('describes constraints and starts a draft of each supported type', () => {
    for (const kind of ['text', 'select', 'number', 'date'] as const)
      expect(filterError(emptyRule(kind))).not.toBeNull();
    expect(describeFilter({ operator: 'number_range', from: '0', to: '' })).toBe('at least 0');
    expect(describeFilter({ operator: 'date_range', from: '', to: '2027-01-01' })).toBe(
      'through 2027-01-01',
    );
    expect(describeFilter({ operator: 'one_of', values: ['a', 'b', 'c'] })).toBe('3 selected');
    expect(filterError({ operator: 'empty' })).toBeNull();
  });
});
