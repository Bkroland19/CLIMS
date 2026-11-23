import { isCalendarDate } from '@/lib/validation';
import type { CellValue } from './tableModel';

export type FilterKind = 'text' | 'select' | 'number' | 'date';
export type FilterRule =
  | { operator: 'contains' | 'equals' | 'not_contains'; value: string }
  | { operator: 'one_of'; values: readonly string[] }
  | { operator: 'number_range' | 'date_range'; from: string; to: string }
  | { operator: 'empty' | 'not_empty' };
export interface ColumnFilter {
  columnId: string;
  rule: FilterRule;
}

const normalise = (value: CellValue) =>
  String(value ?? '')
    .trim()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
const isEmpty = (value: CellValue) =>
  value === null || value === undefined || String(value).trim() === '';
const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Kampala',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Calendar dates stay unchanged; timestamps are compared by the day in Uganda. */
export function filterDate(value: CellValue): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:$|T)/.test(value)) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  if (value.length === 10) return isCalendarDate(value) ? value : null;
  return dateFormatter.format(date);
}

/** Reject incomplete or reversed ranges before applying them; zero is a valid bound. */
export function filterError(rule: FilterRule): string | null {
  switch (rule.operator) {
    case 'empty':
    case 'not_empty':
      return null;
    case 'one_of':
      return rule.values.length ? null : 'Choose at least one value.';
    case 'contains':
    case 'equals':
    case 'not_contains':
      return rule.value.trim() ? null : 'Enter a value to filter by.';
    case 'number_range': {
      const from = rule.from.trim();
      const to = rule.to.trim();
      if (!from && !to) return 'Enter a minimum, a maximum, or both.';
      const numeric = (value: string) =>
        /^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value) && Number.isFinite(Number(value));
      if ((from && !numeric(from)) || (to && !numeric(to))) return 'Enter valid numbers.';
      return from && to && Number(from) > Number(to)
        ? 'The maximum must be at least the minimum.'
        : null;
    }
    case 'date_range':
      if (!rule.from && !rule.to) return 'Choose a start date, an end date, or both.';
      if ((rule.from && !isCalendarDate(rule.from)) || (rule.to && !isCalendarDate(rule.to)))
        return 'Choose valid dates.';
      return rule.from && rule.to && rule.from > rule.to
        ? 'The end date must be on or after the start date.'
        : null;
  }
}

/** One column rule. Multiple columns combine with AND; selected values combine with OR. */
export function matchesFilter(value: CellValue, rule: FilterRule): boolean {
  if (rule.operator === 'empty') return isEmpty(value);
  if (rule.operator === 'not_empty') return !isEmpty(value);
  if (isEmpty(value)) return false;
  switch (rule.operator) {
    case 'contains':
      return normalise(value).includes(normalise(rule.value));
    case 'not_contains':
      return !normalise(value).includes(normalise(rule.value));
    case 'equals':
      return normalise(value) === normalise(rule.value);
    case 'one_of':
      return rule.values.includes(String(value));
    case 'number_range': {
      // Do not coerce labels ("1,000 pieces") or blanks into quantities.
      if (typeof value !== 'number' || !Number.isFinite(value)) return false;
      return (
        (!rule.from.trim() || value >= Number(rule.from)) &&
        (!rule.to.trim() || value <= Number(rule.to))
      );
    }
    case 'date_range': {
      const date = filterDate(value);
      return date !== null && (!rule.from || date >= rule.from) && (!rule.to || date <= rule.to);
    }
  }
}

/** A short chip label; never hides that a constraint is still applied. */
export function describeFilter(rule: FilterRule): string {
  switch (rule.operator) {
    case 'empty':
      return 'is empty';
    case 'not_empty':
      return 'is not empty';
    case 'contains':
      return `contains “${rule.value}”`;
    case 'not_contains':
      return `excludes “${rule.value}”`;
    case 'equals':
      return `is “${rule.value}”`;
    case 'one_of':
      return rule.values.length > 2 ? `${rule.values.length} selected` : rule.values.join(' or ');
    case 'date_range':
      return rule.from && rule.to
        ? `${rule.from} – ${rule.to}`
        : rule.from
          ? `from ${rule.from}`
          : `through ${rule.to}`;
    case 'number_range':
      return rule.from && rule.to
        ? `${rule.from} – ${rule.to}`
        : rule.from
          ? `at least ${rule.from}`
          : `at most ${rule.to}`;
  }
}

export function emptyRule(kind: FilterKind): FilterRule {
  if (kind === 'select') return { operator: 'one_of', values: [] };
  if (kind === 'number' || kind === 'date')
    return { operator: kind === 'number' ? 'number_range' : 'date_range', from: '', to: '' };
  return { operator: 'contains', value: '' };
}
