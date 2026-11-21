const numberFormat = new Intl.NumberFormat('en-UG');
const dateFormat = new Intl.DateTimeFormat('en-UG', { dateStyle: 'medium' });

/** Shown wherever a value is missing, so an empty cell is never ambiguous. */
export const EMPTY_VALUE = '—';

/** Formats a count with thousands separators; anything non-numeric becomes the empty marker. */
export function formatNumber(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return EMPTY_VALUE;
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? numberFormat.format(number) : EMPTY_VALUE;
}

/** Formats an ISO date or timestamp as a calendar date; unparseable input becomes the empty marker. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return EMPTY_VALUE;
  // A date-only value is a calendar day, not an instant: parsing it as UTC
  // midnight would show the previous day west of Greenwich.
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(value);
  return Number.isNaN(date.getTime()) ? EMPTY_VALUE : dateFormat.format(date);
}

const timeFormat = new Intl.DateTimeFormat('en-UG', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const dayMonthFormat = new Intl.DateTimeFormat('en-UG', { day: 'numeric', month: 'short' });
const DAY_MS = 24 * 60 * 60 * 1000;

/** Midnight at the start of `date`'s calendar day, in the display time zone. */
function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/**
 * Formats a timestamp for an activity line or a list: "Today, 09:12",
 * "Yesterday, 17:40", "12 Nov, 08:05", or a full date with the time for
 * another year. Shown in the browser's time zone; unparseable input becomes
 * the empty marker. `now` is for tests.
 */
export function formatTimestamp(value: string | null | undefined, now: Date = new Date()): string {
  if (!value) return EMPTY_VALUE;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return EMPTY_VALUE;
  const time = timeFormat.format(date);
  const days = Math.round((startOfDay(now) - startOfDay(date)) / DAY_MS);
  if (days === 0) return `Today, ${time}`;
  if (days === 1) return `Yesterday, ${time}`;
  if (date.getFullYear() === now.getFullYear()) return `${dayMonthFormat.format(date)}, ${time}`;
  return `${dateFormat.format(date)}, ${time}`;
}

/** Text for a possibly missing string. */
export function formatText(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return EMPTY_VALUE;
  const text = String(value).trim();
  return text === '' ? EMPTY_VALUE : text;
}

const GENERATIONAL_SUFFIX = /^(jr|sr|ii|iii|iv)\.?$/i;
const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/** The first user-perceived character of a word: a whole emoji or accented letter, never half of one. */
function firstGrapheme(word: string): string {
  for (const { segment } of graphemes.segment(word)) return segment;
  return '';
}

/** Up to two initials for an avatar, from a name or username. */
export function initialsOf(name: string | null | undefined): string {
  const allWords = (name ?? '').trim().split(/\s+/).filter(Boolean);
  // "William Montgomery III" is W. M., not W. I.
  const withoutSuffix = allWords.filter((word) => !GENERATIONAL_SUFFIX.test(word));
  const words = withoutSuffix.length > 0 ? withoutSuffix : allWords;
  const first = words[0];
  if (!first) return '?';
  const last = words.length > 1 ? words[words.length - 1] : undefined;
  return [first, last]
    .filter((word): word is string => word !== undefined)
    .map(firstGrapheme)
    .join('')
    .toUpperCase();
}

const MINUTE_MS = 60_000;

/** A length of time in words: "Under 1 min", "45 min", "3 h 20 min", "2 d 4 h". */
export function formatDuration(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / MINUTE_MS));
  if (minutes < 1) return 'Under 1 min';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const rest = minutes % 60;
    return rest > 0 ? `${hours} h ${rest} min` : `${hours} h`;
  }
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  return rest > 0 ? `${days} d ${rest} h` : `${days} d`;
}

/**
 * How long ago a timestamp was, as a person says it: "Today", "Yesterday",
 * "4 days ago", "3 weeks ago", "5 months ago", "2 years ago". Calendar days in
 * the browser's time zone; a future time reads as "Today". Unparseable or
 * missing input becomes the empty marker. `now` is for tests.
 */
export function formatSince(value: string | null | undefined, now: Date = new Date()): string {
  if (!value) return EMPTY_VALUE;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return EMPTY_VALUE;
  const days = Math.max(0, Math.round((startOfDay(now) - startOfDay(date)) / DAY_MS));
  const ago = (count: number, unit: string) => `${count} ${unit}${count === 1 ? '' : 's'} ago`;
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return ago(days, 'day');
  if (days < 35) return ago(Math.floor(days / 7), 'week');
  // Months to the nearest whole one, as people say them: 120 days is "4 months ago".
  if (days < 365) return ago(Math.min(11, Math.max(1, Math.round(days / 30.44))), 'month');
  return ago(Math.floor(days / 365.25), 'year');
}
