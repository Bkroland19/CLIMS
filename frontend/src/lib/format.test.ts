import { describe, expect, it } from 'vitest';

import {
  EMPTY_VALUE,
  formatDate,
  formatDuration,
  formatNumber,
  formatSince,
  formatText,
  formatTimestamp,
  initialsOf,
} from './format';

describe('formatNumber', () => {
  it('adds thousands separators', () => {
    expect(formatNumber(1234567)).toBe('1,234,567');
  });

  it('accepts numeric strings, as the API sends for decimals', () => {
    expect(formatNumber('20000')).toBe('20,000');
  });

  it('formats zero as zero, not as missing', () => {
    expect(formatNumber(0)).toBe('0');
  });

  it.each([null, undefined, '', 'abc', Number.NaN, Number.POSITIVE_INFINITY])(
    'shows the empty marker for %s',
    (value) => {
      expect(formatNumber(value)).toBe(EMPTY_VALUE);
    },
  );
});

describe('formatDate', () => {
  it('formats a date-only value as that calendar day in any timezone', () => {
    expect(formatDate('2026-11-12')).toMatch(/12 Nov 2026|Nov 12, 2026/);
  });

  it('formats a full timestamp', () => {
    expect(formatDate('2026-03-05T10:30:00Z')).toMatch(/Mar/);
  });

  it.each([null, undefined, '', 'not a date', '2026-13-45T00:00:00Z'])(
    'shows the empty marker for %s',
    (value) => {
      expect(formatDate(value)).toBe(EMPTY_VALUE);
    },
  );
});

describe('formatText', () => {
  it('trims and passes text through', () => {
    expect(formatText('  Kampala ')).toBe('Kampala');
  });

  it('shows numbers, including zero', () => {
    expect(formatText(0)).toBe('0');
  });

  it.each([null, undefined, '', '   '])('shows the empty marker for %j', (value) => {
    expect(formatText(value)).toBe(EMPTY_VALUE);
  });
});

describe('initialsOf', () => {
  it.each([
    { name: 'Nakato Sarah', expected: 'NS' },
    { name: 'okello', expected: 'O' },
    { name: '  Jean  Paul   Mukasa ', expected: 'JM' },
    { name: 'Élodie Ñandu', expected: 'ÉÑ' },
    { name: '😀 smile', expected: '😀S' },
    { name: '👩‍⚕️ Nurse', expected: '👩‍⚕️N' },
    { name: 'e\u0301lodie', expected: 'E\u0301' },
    { name: 'Jo', expected: 'J' },
    { name: 'William Montgomery III', expected: 'WM' },
    { name: 'Okello James Jr.', expected: 'OJ' },
    { name: 'II', expected: 'I' },
    { name: '', expected: '?' },
    { name: null, expected: '?' },
    { name: undefined, expected: '?' },
  ])('gives "$expected" for $name', ({ name, expected }) => {
    expect(initialsOf(name)).toBe(expected);
  });
});

describe('formatTimestamp', () => {
  // Built in local time, so the expectations hold in any time zone.
  const now = new Date(2026, 10, 19, 15, 30);
  const at = (day: number, hour: number, minute: number, year = 2026) =>
    new Date(year, 10, day, hour, minute).toISOString();

  it('names today and yesterday, with a 24-hour time', () => {
    expect(formatTimestamp(at(19, 9, 5), now)).toBe('Today, 09:05');
    expect(formatTimestamp(at(18, 17, 40), now)).toBe('Yesterday, 17:40');
  });

  it('gives the day and month for earlier this year', () => {
    expect(formatTimestamp(at(12, 8, 5), now)).toMatch(/^12 Nov, 08:05$/);
  });

  it('adds the year for another year', () => {
    expect(formatTimestamp(at(12, 8, 5, 2025), now)).toMatch(/2025, 08:05$/);
  });

  it.each([null, undefined, '', 'not a date'])('shows the empty marker for %s', (value) => {
    expect(formatTimestamp(value, now)).toBe(EMPTY_VALUE);
  });
});

const MINUTE = 60_000;

describe('formatDuration', () => {
  it.each([
    [0, 'Under 1 min'],
    [20_000, 'Under 1 min'],
    [45 * MINUTE, '45 min'],
    [60 * MINUTE, '1 h'],
    [200 * MINUTE, '3 h 20 min'],
    [24 * 60 * MINUTE, '1 d'],
    [(2 * 24 + 4) * 60 * MINUTE, '2 d 4 h'],
    [-5 * MINUTE, 'Under 1 min'],
  ])('writes %i ms as "%s"', (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected);
  });
});

describe('formatSince', () => {
  const now = new Date(2026, 10, 20, 15, 0);
  it.each([
    [new Date(2026, 10, 20, 9, 0), 'Today'],
    [new Date(2026, 10, 19, 23, 0), 'Yesterday'],
    [new Date(2026, 10, 16, 9, 0), '4 days ago'],
    [new Date(2026, 10, 6, 9, 0), '2 weeks ago'],
    [new Date(2026, 9, 1, 9, 0), '2 months ago'],
    [new Date(2026, 4, 20, 9, 0), '6 months ago'],
    [new Date(2024, 4, 1, 9, 0), '2 years ago'],
    [new Date(2026, 10, 21, 9, 0), 'Today'],
  ])('reads %s as %s', (date, expected) => {
    expect(formatSince(date.toISOString(), now)).toBe(expected);
  });

  it('marks missing or unreadable values', () => {
    expect(formatSince(null, now)).toBe('—');
    expect(formatSince('soon', now)).toBe('—');
  });
});
