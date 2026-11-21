import { describe, expect, it } from 'vitest';

import {
  locationNeedFor,
  newUserSchema,
  newUserSchemaFor,
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
  role_id: 'role-1',
  password: 'correct horse',
  region_id: '',
  district_id: '',
  subcounty_id: '',
  village: '',
  hot_spot_id: '',
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
    { field: 'role_id', value: '' },
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
  it('sends the phone in +256 form, short enough for the 15-character limit, the email lower-cased and the one role as a list', () => {
    const body = toNewUserInput(newUserSchema.parse(valid), null);
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
    expect(
      toNewUserInput(newUserSchema.parse({ ...valid, phone_number: '' }), null).phone_number,
    ).toBe('');
  });

  it('sends the hotspot for a hotspot manager, and no other part of the place', () => {
    const values = newUserSchema.parse({
      ...valid,
      region_id: 'r',
      district_id: 'd',
      village: 'Kasenyi',
      hot_spot_id: 'hotspot-1',
    });
    const body = toNewUserInput(values, locationNeedFor('hotspot manager'));
    expect(body).toMatchObject({ hot_spot_id: 'hotspot-1' });
    expect(body).not.toHaveProperty('district_id');
    expect(body).not.toHaveProperty('village');
  });

  it('leaves a hotspot chosen earlier behind when the role no longer asks for one', () => {
    const values = newUserSchema.parse({ ...valid, hot_spot_id: 'hotspot-1' });
    expect(toNewUserInput(values, locationNeedFor('vht'))).not.toHaveProperty('hot_spot_id');
    expect(toNewUserInput(values, null)).not.toHaveProperty('hot_spot_id');
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

describe('locationNeedFor', () => {
  it('asks a hotspot manager for the district and the hotspot they run, with no subcounty step', () => {
    expect(locationNeedFor('Hotspot Manager')).toMatchObject({
      pick: 'hotspot',
      required: ['region_id', 'district_id', 'hot_spot_id'],
    });
  });

  it('asks a VHT for every level, down to the village', () => {
    expect(locationNeedFor('vht')).toMatchObject({
      pick: 'village',
      required: ['region_id', 'district_id', 'subcounty_id', 'village'],
    });
  });

  it('asks a district focal person or rider for the region and district only', () => {
    expect(locationNeedFor('dfcp')?.required).toEqual(['region_id', 'district_id']);
    expect(locationNeedFor('delivery agent')?.required).toEqual(['region_id', 'district_id']);
  });

  it.each(['admin', 'moh', 'jms', null])('asks nothing of %s', (role) => {
    expect(locationNeedFor(role)).toBeNull();
  });
});

describe('newUserSchemaFor', () => {
  const names: Record<string, string> = {
    'role-1': 'moh',
    'role-dfcp': 'dfcp',
    'role-vht': 'vht',
    'role-manager': 'hotspot manager',
  };
  const schema = newUserSchemaFor((id) => names[id] ?? null);
  const issues = (values: unknown) =>
    schema.safeParse(values).error?.issues.map((issue) => issue.path[0]) ?? [];

  it('needs no location for a role that works nowhere in particular', () => {
    expect(issues(valid)).toEqual([]);
  });

  it('needs the region and district for a district focal person', () => {
    expect(issues({ ...valid, role_id: 'role-dfcp' })).toEqual(['region_id', 'district_id']);
    expect(issues({ ...valid, role_id: 'role-dfcp', region_id: 'r', district_id: 'd' })).toEqual(
      [],
    );
  });

  it('needs every level for a VHT, and a village that is more than spaces', () => {
    const place = { region_id: 'r', district_id: 'd', subcounty_id: 's' };
    expect(issues({ ...valid, ...place, role_id: 'role-vht', village: '   ' })).toEqual([
      'village',
    ]);
    expect(issues({ ...valid, ...place, role_id: 'role-vht', village: 'x'.repeat(61) })).toEqual([
      'village',
    ]);
  });

  it('needs the hotspot for a hotspot manager, but no subcounty or village', () => {
    const place = { region_id: 'r', district_id: 'd' };
    expect(issues({ ...valid, ...place, role_id: 'role-manager' })).toEqual(['hot_spot_id']);
    expect(issues({ ...valid, ...place, role_id: 'role-manager', hot_spot_id: 'h' })).toEqual([]);
  });

  it('ignores a village left over from another role while it is hidden', () => {
    expect(
      issues({
        ...valid,
        role_id: 'role-manager',
        region_id: 'r',
        district_id: 'd',
        hot_spot_id: 'h',
        village: 'x'.repeat(61),
      }),
    ).toEqual([]);
  });
});
