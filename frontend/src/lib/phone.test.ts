import { describe, expect, it } from 'vitest';

import {
  formatUgandanMobile,
  optionalUgandanMobile,
  parseUgandanMobile,
  ugandanMobile,
} from './phone';

describe('parseUgandanMobile', () => {
  it.each([
    ['+256772123456'],
    ['+256 772 123 456'],
    ['256772123456'],
    ['256 772 123456'],
    ['0772123456'],
    ['0772 123 456'],
    ['772123456'],
    ['772 123 456'],
    ['+256-772-123-456'],
    ['(+256) 772.123.456'],
    ['+256 (0) 772 123456'],
    ['  0772123456  '],
  ])('reads %j as +256772123456', (input) => {
    expect(parseUgandanMobile(input)).toBe('+256772123456');
  });

  it.each([
    ['', 'empty'],
    ['0412 123456', 'a landline'],
    ['+256 412 123 456', 'a landline with the country code'],
    ['077212345', 'one digit short'],
    ['07721234567', 'one digit long'],
    ['+254 712 345 678', 'another country'],
    ['+772123456', 'a plus without the country code'],
    ['0772 12345a', 'a letter'],
    ['256', 'only the country code'],
    ['+256 +772 123 456', 'a second plus'],
  ])('rejects %j (%s)', (input) => {
    expect(parseUgandanMobile(input)).toBeNull();
  });
});

describe('formatUgandanMobile', () => {
  it('groups the number for reading', () => {
    expect(formatUgandanMobile('0772123456')).toBe('+256 772 123 456');
    expect(formatUgandanMobile('+256701334920')).toBe('+256 701 334 920');
  });

  it('returns anything it cannot read unchanged', () => {
    expect(formatUgandanMobile('0412 123456')).toBe('0412 123456');
  });
});

describe('ugandanMobile schema', () => {
  const schema = ugandanMobile('your phone number');

  it('yields the E.164 form', () => {
    expect(schema.parse(' 0772 123 456 ')).toBe('+256772123456');
  });

  it('asks for the number when the field is empty', () => {
    const result = schema.safeParse('   ');
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('Enter your phone number.');
  });

  it('gives an example when the number is not a Ugandan mobile', () => {
    const result = schema.safeParse('0412 123456');
    expect(result.error?.issues[0]?.message).toBe(
      'Enter a Ugandan mobile number, e.g. +256 772 123 456.',
    );
  });
});

describe('optionalUgandanMobile schema', () => {
  const schema = optionalUgandanMobile();

  it('yields the E.164 form', () => {
    expect(schema.parse('0772 123 456')).toBe('+256772123456');
  });

  it('accepts a blank field as blank', () => {
    expect(schema.parse('   ')).toBe('');
  });

  it('gives an example when the number is not a Ugandan mobile', () => {
    const result = schema.safeParse('+254 712 345 678');
    expect(result.error?.issues[0]?.message).toBe(
      'Enter a Ugandan mobile number, e.g. +256 772 123 456.',
    );
  });
});
