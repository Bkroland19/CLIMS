import { describe, expect, it } from 'vitest';

import {
  newUserSchema,
  toNewUserInput,
  userDisplayName,
  userRolesSchema,
  type NewUserFormInput,
} from './userForm';

const valid: NewUserFormInput = {
  firstname: 'Sarah',
  lastname: 'Nakato',
  username: 'snakato',
  email: 'Sarah@Example.org',
  phone_number: '+256 772 100 201',
  role_ids: ['role-1'],
  password: 'correct horse',
};

const firstIssue = (values: unknown) => newUserSchema.safeParse(values).error?.issues[0]?.path[0];

describe('newUserSchema', () => {
  it('accepts a complete form', () => {
    expect(newUserSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts a blank phone number, which the API treats as optional', () => {
    expect(newUserSchema.safeParse({ ...valid, phone_number: '' }).success).toBe(true);
  });

  it('trims surrounding whitespace from text fields', () => {
    const parsed = newUserSchema.parse({ ...valid, firstname: '  Sarah ', username: ' snakato ' });
    expect(parsed).toMatchObject({ firstname: 'Sarah', username: 'snakato' });
  });

  it.each([
    { field: 'firstname', value: '   ' },
    { field: 'firstname', value: 'A'.repeat(21) },
    { field: 'lastname', value: '' },
    { field: 'username', value: 'ab' },
    { field: 'username', value: 'a'.repeat(51) },
    { field: 'username', value: 'sarah nakato' },
    { field: 'email', value: 'sarah@' },
    { field: 'email', value: '' },
    { field: 'phone_number', value: '12345' },
    { field: 'phone_number', value: '+254 712 345 678' },
    { field: 'phone_number', value: '+256700000001; DROP TABLE users' },
    { field: 'role_ids', value: [] },
    { field: 'password', value: '' },
    { field: 'password', value: 'short' },
    { field: 'password', value: 'x'.repeat(73) },
  ])('rejects $field = "$value"', ({ field, value }) => {
    expect(firstIssue({ ...valid, [field]: value })).toBe(field);
  });

  it('counts the password limit in bytes, as the server does', () => {
    // 24 three-byte characters are 72 bytes; one more is over.
    expect(firstIssue({ ...valid, password: '€'.repeat(24) })).toBeUndefined();
    expect(firstIssue({ ...valid, password: '€'.repeat(25) })).toBe('password');
  });

  it('does not trim the password', () => {
    expect(newUserSchema.parse({ ...valid, password: ' spaced out ' }).password).toBe(
      ' spaced out ',
    );
  });
});

describe('phone number', () => {
  it.each([
    ['+256 772 100 201', '+256772100201'],
    ['256772100201', '+256772100201'],
    ['0772-100-201', '+256772100201'],
  ])('reads %s as %s', (input, expected) => {
    expect(newUserSchema.parse({ ...valid, phone_number: input }).phone_number).toBe(expected);
  });

  it.each(['0772 100 20', '+256 872 100 201', '+1 202 555 0100', '(0414) 123456'])(
    'rejects %s',
    (input) => {
      expect(firstIssue({ ...valid, phone_number: input })).toBe('phone_number');
    },
  );
});

describe('toNewUserInput', () => {
  it('sends the phone in +256 form, short enough for the 15-character limit, and the email lower-cased', () => {
    const body = toNewUserInput(newUserSchema.parse(valid));
    expect(body).toEqual({
      username: 'snakato',
      email: 'sarah@example.org',
      password: 'correct horse',
      firstname: 'Sarah',
      lastname: 'Nakato',
      phone_number: '+256772100201',
      role_ids: ['role-1'],
    });
    expect(body.phone_number.length).toBeLessThanOrEqual(15);
  });

  it('sends a blank phone as blank', () => {
    expect(toNewUserInput(newUserSchema.parse({ ...valid, phone_number: '' })).phone_number).toBe(
      '',
    );
  });
});

describe('userRolesSchema', () => {
  it('needs at least one role', () => {
    expect(userRolesSchema.safeParse({ role_ids: [] }).success).toBe(false);
    expect(userRolesSchema.safeParse({ role_ids: ['role-1'] }).success).toBe(true);
  });
});

describe('userDisplayName', () => {
  it.each([
    {
      name: 'both names',
      user: { id: '1', firstname: 'A', lastname: 'B', username: 'ab' },
      expected: 'A B',
    },
    {
      name: 'one name',
      user: { id: '1', firstname: null, lastname: 'B', username: 'ab' },
      expected: 'B',
    },
    {
      name: 'only a username',
      user: { id: '1', firstname: null, lastname: null, username: 'ab' },
      expected: 'ab',
    },
    {
      name: 'nothing but an id',
      user: { id: '9', firstname: null, lastname: null, username: null },
      expected: 'User 9',
    },
  ])('uses $name', ({ user, expected }) => {
    expect(userDisplayName(user)).toBe(expected);
  });
});
