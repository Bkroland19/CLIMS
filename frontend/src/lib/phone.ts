import { z } from 'zod';

/*
 * Ugandan mobile numbers. People type them every way they see them written:
 * `0772 123456`, `772123456`, `+256 772 123 456`, `256-772-123456`, even
 * `+256 (0) 772 123456`. All of these are one number, which is stored and sent
 * as E.164 (`+256772123456`) and shown grouped (`+256 772 123 456`).
 *
 * A mobile number is the country code 256 followed by nine digits starting
 * with 7. Landlines (starting with 3 or 4) cannot receive the SMS codes this
 * is used for, so they are rejected rather than accepted and silently unusable.
 */

const COUNTRY_CODE = '256';

/** Separators people put inside a phone number. */
const SEPARATORS = /[\s().-]/g;

/** Nine digits starting with 7: the national part of a Ugandan mobile number. */
const NATIONAL_MOBILE = /^7\d{8}$/;

/**
 * The E.164 form (`+256772123456`) of a Ugandan mobile number typed in any
 * common way, or `null` when `input` is not one.
 */
export function parseUgandanMobile(input: string): string | null {
  let digits = input.trim().replace(SEPARATORS, '');
  if (digits.startsWith('+')) {
    // A leading plus is only meaningful before the country code.
    if (!digits.startsWith(`+${COUNTRY_CODE}`)) return null;
    digits = digits.slice(1);
  }
  if (!/^\d+$/.test(digits)) return null;

  let national: string;
  if (digits.startsWith(COUNTRY_CODE) && digits.length > 9) {
    national = digits.slice(COUNTRY_CODE.length);
    // "+256 (0) 772 …": the trunk zero is sometimes written after the country code.
    if (national.length === 10 && national.startsWith('0')) national = national.slice(1);
  } else if (digits.length === 10 && digits.startsWith('0')) {
    national = digits.slice(1);
  } else {
    national = digits;
  }

  return NATIONAL_MOBILE.test(national) ? `+${COUNTRY_CODE}${national}` : null;
}

/**
 * A Ugandan mobile number for display, grouped as `+256 772 123 456`. Accepts
 * any form {@link parseUgandanMobile} does; anything else is returned as given,
 * so a malformed number from a record is still shown rather than hidden.
 */
export function formatUgandanMobile(input: string): string {
  const e164 = parseUgandanMobile(input);
  if (!e164) return input;
  const national = e164.slice(COUNTRY_CODE.length + 1);
  return `+${COUNTRY_CODE} ${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(6)}`;
}

/** The example shown in guidance and error messages. */
export const UGANDAN_MOBILE_EXAMPLE = '+256 772 123 456';

/** The E.164 form of `value`, or a validation issue explaining what is expected. */
function toE164(value: string, context: z.core.$RefinementCtx<string>): string {
  const e164 = parseUgandanMobile(value);
  if (e164) return e164;
  context.addIssue({
    code: 'custom',
    message: `Enter a Ugandan mobile number, e.g. ${UGANDAN_MOBILE_EXAMPLE}.`,
  });
  return z.NEVER;
}

/**
 * A form field holding a Ugandan mobile number. Validates the typed text and
 * yields the E.164 form. `noun` completes "Enter …" when the field is empty.
 */
export function ugandanMobile(noun = 'a phone number') {
  return z.string().trim().min(1, `Enter ${noun}.`).transform(toE164);
}

/**
 * Like {@link ugandanMobile}, for a field that may be left blank: a blank
 * field yields `''`, anything else must be a Ugandan mobile number.
 */
export function optionalUgandanMobile() {
  return z
    .string()
    .trim()
    .transform((value, context) => (value === '' ? '' : toE164(value, context)));
}
