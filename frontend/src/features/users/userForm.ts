import { z } from 'zod';

import { optionalUgandanMobile } from '@/lib/phone';

import type { NewUserInput, User } from './api';

/*
 * Mirrors the Go API's `AccountInput` and `CreateUserRequest` rules
 * (`backend/internal/features/users/dto.go`): username 3–50, email required
 * and at most 255, password 8–72 bytes, first and last name at most 20,
 * phone at most 15, and at least one role. The form also asks for both names,
 * as the design does, and checks the phone number is a Ugandan mobile one
 * (sent as `+256XXXXXXXXX`, 13 characters).
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
  role_ids: roleIds,
  // Never trimmed: spaces in a password are part of it.
  password: z
    .string()
    .min(1, 'Enter a password.')
    .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters.`)
    .refine(
      (value) => new TextEncoder().encode(value).length <= PASSWORD_MAX_BYTES,
      `Use at most ${PASSWORD_MAX_BYTES} characters.`,
    ),
});

export type NewUserFormInput = z.input<typeof newUserSchema>;
export type NewUserFormOutput = z.output<typeof newUserSchema>;

export const NEW_USER_FIELDS = [
  'firstname',
  'lastname',
  'username',
  'email',
  'phone_number',
  'role_ids',
  'password',
] as const satisfies readonly (keyof NewUserFormInput)[];

export const NEW_USER_DEFAULTS: NewUserFormInput = {
  firstname: '',
  lastname: '',
  username: '',
  email: '',
  phone_number: '',
  role_ids: [],
  password: '',
};

/** The request body for the validated form: the email lower-cased; the phone is already in `+256` form. */
export function toNewUserInput(values: NewUserFormOutput): NewUserInput {
  return {
    username: values.username,
    email: values.email.toLowerCase(),
    password: values.password,
    firstname: values.firstname,
    lastname: values.lastname,
    phone_number: values.phone_number,
    role_ids: values.role_ids,
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
