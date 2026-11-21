import { z } from 'zod';

import { optionalUgandanMobile } from '@/lib/phone';

import type { NewUserInput, User } from './api';

/*
 * Mirrors the Go API's `AccountInput` and `CreateUserRequest` rules
 * (`backend/internal/features/users/dto.go`): username 3–50, email required
 * and at most 255, password 8–72 bytes, first and last name at most 20,
 * phone at most 15, and at least one role. A new user starts with exactly one
 * role; more can be added afterwards with Edit roles. The form also asks for
 * both names, as the design does, and checks the phone number is a Ugandan
 * mobile one (sent as `+256XXXXXXXXX`, 13 characters).
 */

const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_BYTES = 72;
const NAME_MAX_LENGTH = 20;

const name = (noun: string) =>
  z
    .string()
    .trim()
    .min(1, `Enter a ${noun}.`)
    .max(NAME_MAX_LENGTH, `Use at most ${NAME_MAX_LENGTH} characters.`);

const roleIds = z
  .array(z.string())
  .min(1, 'Choose at least one role.')
  .max(100, 'Choose at most 100 roles.');

export const newUserSchema = z.object({
  firstname: name('first name'),
  lastname: name('last name'),
  username: z
    .string()
    .trim()
    .min(1, 'Enter a username.')
    .min(3, 'Use at least 3 characters.')
    .max(50, 'Use at most 50 characters.')
    .regex(/^\S+$/, 'A username cannot contain spaces.'),
  email: z
    .string()
    .trim()
    .min(1, 'Enter an email address.')
    .max(255, 'Use at most 255 characters.')
    .pipe(z.email('Enter a valid email address, e.g. name@example.org.')),
  phone_number: optionalUgandanMobile(),
  role_id: z.string().min(1, 'Choose a role.'),
  // Never trimmed: spaces in a password are part of it.
  password: z
    .string()
    .min(1, 'Enter a password.')
    .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters.`)
    .refine(
      (value) => new TextEncoder().encode(value).length <= PASSWORD_MAX_BYTES,
      `Use at most ${PASSWORD_MAX_BYTES} characters.`,
    ),
  // Where the person works, shown and checked by role (see `locationNeedFor`). The API keeps
  // a hotspot manager's hotspot and, from the district, a DCFP's or delivery agent's store
  // (`stores.ts`); the rest of the place is only checked here.
  region_id: z.string(),
  district_id: z.string(),
  subcounty_id: z.string(),
  village: z.string().trim(),
  hot_spot_id: z.string(),
});

export type LocationField =
  'region_id' | 'district_id' | 'subcounty_id' | 'village' | 'hot_spot_id';

export interface LocationNeed {
  /**
   * How the place ends: with the subcounty and the village, typed, or with
   * the hotspot the person runs, picked from those in the district.
   */
  pick: 'village' | 'hotspot';
  /** The fields that must be filled; the other levels shown are optional. */
  required: readonly LocationField[];
  /** One line on why, e.g. "A hotspot manager runs one hotspot." */
  reason: string;
}

const VILLAGE_MAX_LENGTH = 60;

/**
 * Whether a role needs a place, and how precise. `null` when the role works
 * in no one place (MOH, administrators, the warehouses) or none is chosen.
 */
export function locationNeedFor(roleName: string | null): LocationNeed | null {
  switch (roleName?.trim().toLowerCase()) {
    case 'hotspot manager':
      // No subcounty step: most hotspots on record have none, so it would hide them.
      return {
        pick: 'hotspot',
        required: ['region_id', 'district_id', 'hot_spot_id'],
        reason:
          'A hotspot manager runs one hotspot. Choose its district, then find it by name or village.',
      };
    case 'vht':
      return {
        pick: 'village',
        required: ['region_id', 'district_id', 'subcounty_id', 'village'],
        reason: 'A VHT works in one village and maps the hotspots there.',
      };
    case 'dfcp':
    case 'dcfp':
    case 'delivery agent':
      return {
        pick: 'village',
        required: ['region_id', 'district_id'],
        reason:
          'A district focal person or delivery agent works in one district, at its store. Subcounty and village are optional.',
      };
    default:
      return null;
  }
}

const LOCATION_MESSAGES: Record<LocationField, string> = {
  region_id: 'Choose a region.',
  district_id: 'Choose a district.',
  subcounty_id: 'Choose a subcounty.',
  village: 'Enter the village.',
  hot_spot_id: 'Choose the hotspot they run.',
};

/**
 * The new-user rules, plus the place the chosen role needs. `roleNameOf`
 * turns a role id into its name, from the roles list.
 */
export function newUserSchemaFor(roleNameOf: (roleId: string) => string | null) {
  return newUserSchema.superRefine((values, context) => {
    const need = locationNeedFor(roleNameOf(values.role_id));
    for (const field of need?.required ?? []) {
      if (values[field].trim() === '') {
        context.addIssue({ code: 'custom', path: [field], message: LOCATION_MESSAGES[field] });
      }
    }
    // Checked only while the village is asked for, so a hidden one never blocks the form.
    if (need?.pick === 'village' && values.village.length > VILLAGE_MAX_LENGTH) {
      context.addIssue({
        code: 'custom',
        path: ['village'],
        message: `Use at most ${VILLAGE_MAX_LENGTH} characters.`,
      });
    }
  });
}

export type NewUserFormInput = z.input<typeof newUserSchema>;
export type NewUserFormOutput = z.output<typeof newUserSchema>;

export const NEW_USER_FIELDS = [
  'firstname',
  'lastname',
  'username',
  'email',
  'phone_number',
  'role_id',
  'password',
  'hot_spot_id',
] as const satisfies readonly (keyof NewUserFormInput)[];

export const NEW_USER_DEFAULTS: NewUserFormInput = {
  firstname: '',
  lastname: '',
  username: '',
  email: '',
  phone_number: '',
  role_id: '',
  password: '',
  region_id: '',
  district_id: '',
  subcounty_id: '',
  village: '',
  hot_spot_id: '',
};

/** The API reports role errors under `role_ids`, which the create form asks for as `role_id`. */
export const NEW_USER_SERVER_FIELDS = { role_ids: 'role_id' } as const satisfies Readonly<
  Record<string, keyof NewUserFormInput>
>;

/**
 * The request body for the validated form: the email lower-cased; the phone is
 * already in `+256` form; the one role as a list. `need` is the chosen role's
 * (`locationNeedFor`): its hotspot is sent when it asks for one, and the rest
 * of the place stays behind (see the schema). `storeId` is the store the role
 * works at (`storeFor`), when it has one.
 */
export function toNewUserInput(
  values: NewUserFormOutput,
  need: LocationNeed | null,
  storeId: string | null = null,
): NewUserInput {
  return {
    username: values.username,
    email: values.email.toLowerCase(),
    password: values.password,
    firstname: values.firstname,
    lastname: values.lastname,
    phone_number: values.phone_number,
    role_ids: [values.role_id],
    ...(need?.pick === 'hotspot' && values.hot_spot_id ? { hot_spot_id: values.hot_spot_id } : {}),
    ...(storeId ? { store_id: storeId } : {}),
  };
}

export const userRolesSchema = z.object({ role_ids: roleIds });
export type UserRolesForm = z.infer<typeof userRolesSchema>;
export const USER_ROLES_FIELDS = ['role_ids'] as const satisfies readonly (keyof UserRolesForm)[];

/** A user's display name, falling back to the username, then the id. */
export function userDisplayName(
  user: Pick<User, 'id' | 'firstname' | 'lastname' | 'username'>,
): string {
  const fullName = [user.firstname, user.lastname].filter(Boolean).join(' ');
  return fullName || user.username || `User ${user.id}`;
}
