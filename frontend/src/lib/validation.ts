import { z } from 'zod';

/**
 * Schemas for numbers typed into text inputs. Inputs hold strings, so each
 * takes the raw text and yields a number, with messages that say what to type.
 */

interface Range {
  min: number;
  max: number;
}

/** A whole number within `range`, e.g. a quantity. `noun` completes "Enter …". */
export function wholeNumber(noun: string, { min, max }: Range) {
  return z
    .string()
    .trim()
    .min(1, `Enter ${noun}.`)
    .regex(/^\d+$/, 'Use a whole number, with no decimals or symbols.')
    .transform(Number)
    .pipe(
      z
        .number()
        .min(min, `Must be at least ${min.toLocaleString('en')}.`)
        .max(max, `Must be at most ${max.toLocaleString('en')}.`),
    );
}

/** A decimal number within `range`, e.g. a unit cost or a coordinate. */
export function decimalNumber(noun: string, { min, max }: Range) {
  return z
    .string()
    .trim()
    .min(1, `Enter ${noun}.`)
    .regex(/^-?\d+(\.\d+)?$/, 'Use digits only, with a dot for decimals.')
    .transform(Number)
    .pipe(
      z
        .number()
        .min(min, `Must be at least ${min.toLocaleString('en')}.`)
        .max(max, `Must be at most ${max.toLocaleString('en')}.`),
    );
}

/** A calendar date (`YYYY-MM-DD`, as a date input produces) that is not in the future. */
export function pastOrPresentDate(noun: string, today: () => Date = () => new Date()) {
  return z
    .string()
    .min(1, `Enter ${noun}.`)
    .refine(isCalendarDate, 'Enter a valid date.')
    .refine((value) => value <= toDateInputValue(today()), 'The date cannot be in the future.');
}

/** A date as the `YYYY-MM-DD` string a date input uses, in local time. */
export function toDateInputValue(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

/** Strict date-input validation; Date alone rolls impossible dates into another month. */
export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
