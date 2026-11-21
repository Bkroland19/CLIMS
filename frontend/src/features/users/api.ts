import { z } from 'zod';

import { deviceSessionSchema, type DeviceSession } from '@/features/auth/deviceSessions';
import {
  ApiError,
  optionalNumber,
  optionalText,
  parseBody,
  parseList,
  roleSchema,
  toApiError,
  type HttpClient,
} from '@/lib/api';

/*
 * Users, roles and permissions: the Go API's `users` and `rbac` features
 * (`backend/internal/features/{users,rbac}`). Every path here exists there.
 *
 *   GET    /users?limit&offset      { users, limit, offset }    users:read
 *   POST   /users                   { user_id }                 users:create + roles:assign
 *   PUT    /users/:id/roles         { role_ids }                roles:assign
 *   PATCH  /users/:id/status        { status: active|disabled } users:update
 *   GET    /users/:id/sessions      [session]                   users:read
 *   DELETE /users/:id/sessions      { revoked }                 users:update
 *   GET    /roles                   [{ id, name, permissions }] roles:read
 *   PUT    /roles/:id/permissions   { permissions }             roles:manage
 *   GET    /permissions             [code]                      roles:read
 *
 * The API has no endpoint to edit a user's name, email or phone, and none to
 * delete a user: an account is switched off by disabling it.
 *
 * Not used: `PATCH /users/:id/role` sets a single role and is superseded by
 * `PUT /users/:id/roles`, which sets them all; `GET /users/:id` returns what
 * the list already holds.
 */

/** Ids are UUIDs in the Go API; anything else is kept as text rather than guessed at. */
const idText = z
  .union([z.string(), z.number()])
  .transform((value) => String(value).trim())
  .pipe(z.string().min(1));

const roleRefSchema = z.object({
  id: idText,
  name: optionalText,
  permissions: z
    .array(z.string())
    .nullish()
    .transform((codes) => codes ?? []),
});

export type Role = z.infer<typeof roleRefSchema>;

const userSchema = z
  .object({
    id: idText,
    username: optionalText,
    firstname: optionalText,
    lastname: optionalText,
    email: optionalText,
    phone_number: optionalText,
    status: optionalText,
    role: z.unknown().optional(),
    roles: z.array(roleRefSchema).nullish(),
    /** When they last signed in; null for an account never used. */
    last_login_at: optionalText,
    login_count: optionalNumber,
    /** Devices signed in now. */
    active_sessions: optionalNumber,
    created_at: optionalText,
  })
  .transform(({ role, roles, ...user }) => {
    const primary = roleRefSchema.safeParse(role);
    const label = roleSchema.safeParse(role);
    return {
      ...user,
      /** The primary role's name, for screens that show one role. */
      role: label.success ? label.data : null,
      /** Every role the user holds. */
      roles: roles ?? (primary.success ? [primary.data] : []),
    };
  });

export type User = z.output<typeof userSchema>;

/** The statuses the API accepts for `PATCH /users/:id/status`. */
export type UserStatus = 'active' | 'disabled';

/** `POST /users`. `phone_number` is sent normalised (`+256…`) or blank. */
export interface NewUserInput {
  username: string;
  email: string;
  password: string;
  firstname: string;
  lastname: string;
  phone_number: string;
  role_ids: string[];
}

/** The API's largest page; the list is read page by page up to this many pages. */
const PAGE_SIZE = 100;
const MAX_PAGES = 20;

function pageItems(body: unknown): unknown {
  // The Go API pages the list as `{ users, limit, offset }`; `users` is null when empty.
  if (typeof body === 'object' && body !== null && 'users' in body) return body.users ?? [];
  return body;
}

export async function listUsers(http: HttpClient, signal?: AbortSignal): Promise<User[]> {
  const users: User[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const body = await http.get(`/users?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`, {
      signal,
    });
    const items = parseList(userSchema, pageItems(body), 'users');
    users.push(...items);
    // A bare list, or a short page, is the whole of what is left.
    if (Array.isArray(body) || items.length < PAGE_SIZE) break;
  }
  return users;
}

export async function createUser(http: HttpClient, input: NewUserInput): Promise<void> {
  try {
    await http.post('/users', input);
  } catch (error) {
    throw readableUserError(error);
  }
}

export async function setUserRoles(
  http: HttpClient,
  id: string,
  roleIds: readonly string[],
): Promise<void> {
  try {
    await http.put(`/users/${encodeURIComponent(id)}/roles`, { role_ids: roleIds });
  } catch (error) {
    throw readableUserError(error);
  }
}

export async function setUserStatus(
  http: HttpClient,
  id: string,
  status: UserStatus,
): Promise<void> {
  await http.patch(`/users/${encodeURIComponent(id)}/status`, { status });
}

/** Every unexpired session of a user, including ones already signed out. */
export async function listUserSessions(
  http: HttpClient,
  userId: string,
  signal?: AbortSignal,
): Promise<DeviceSession[]> {
  const body = await http.get(`/users/${encodeURIComponent(userId)}/sessions`, { signal });
  return parseList(deviceSessionSchema, body, 'user sessions');
}

/** Signs a user out on every device. Resolves to how many sessions that ended. */
export async function revokeUserSessions(http: HttpClient, userId: string): Promise<number> {
  const body = await http.delete(`/users/${encodeURIComponent(userId)}/sessions`);
  return parseBody(z.object({ revoked: z.number().int().nonnegative() }), body, 'revoke sessions')
    .revoked;
}

export async function listRoles(http: HttpClient, signal?: AbortSignal): Promise<Role[]> {
  return parseList(roleRefSchema, await http.get('/roles', { signal }), 'roles');
}

export async function listPermissions(http: HttpClient, signal?: AbortSignal): Promise<string[]> {
  return parseBody(z.array(z.string()), await http.get('/permissions', { signal }), 'permissions');
}

export async function setRolePermissions(
  http: HttpClient,
  roleId: string,
  permissions: readonly string[],
): Promise<void> {
  await http.put(`/roles/${encodeURIComponent(roleId)}/permissions`, { permissions });
}

/** Counts by status for the dashboard. Anything not marked active counts as inactive. */
export function summariseUsers(users: readonly Pick<User, 'status'>[]): {
  total: number;
  active: number;
  inactive: number;
} {
  const active = users.filter((user) => user.status?.toLowerCase() === 'active').length;
  return { total: users.length, active, inactive: users.length - active };
}

/*
 * The Go validator reports errors under the request struct's Go field names
 * with a rule tag, e.g. `{ "Username": "failed on validation rule: min" }`.
 * These turn them into the form's field names and a sentence a person can act on.
 */
const GO_FIELDS: Readonly<Record<string, string>> = {
  Username: 'username',
  Email: 'email',
  Password: 'password',
  Firstname: 'firstname',
  Lastname: 'lastname',
  Phone: 'phone_number',
  RoleID: 'role_ids',
  RoleIDs: 'role_ids',
};

const RULE_MESSAGES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  username: {
    required: 'Enter a username.',
    min: 'Use at least 3 characters.',
    max: 'Use at most 50 characters.',
  },
  email: {
    required: 'Enter an email address.',
    email: 'Enter a valid email address, e.g. name@example.org.',
    max: 'Use at most 255 characters.',
  },
  password: {
    required: 'Enter a password.',
    min: 'Use at least 8 characters.',
    max: 'Use at most 72 characters.',
  },
  firstname: { max: 'Use at most 20 characters.' },
  lastname: { max: 'Use at most 20 characters.' },
  phone_number: { max: 'Enter the number as +256 followed by 9 digits.' },
  role_ids: { default: 'Choose at least one role from the list.' },
};

/** Messages the API sends without a field, matched to the field they are about. */
const MESSAGE_FIELDS: readonly { pattern: RegExp; field: string; message: string }[] = [
  {
    pattern: /email already exists/i,
    field: 'email',
    message: 'An account with this email address already exists.',
  },
  { pattern: /password must not exceed/i, field: 'password', message: 'Use at most 72 bytes.' },
  {
    pattern: /role_id/i,
    field: 'role_ids',
    message: 'Choose at least one role from the list.',
  },
];

function readableMessage(field: string, raw: string): string {
  const rule = /failed on validation rule: (\w+)/.exec(raw)?.[1];
  if (!rule) return raw;
  const messages = RULE_MESSAGES[field];
  return messages?.[rule] ?? messages?.default ?? 'Check this value.';
}

/** Rewrites a user-write failure so its messages land beside the right form fields. */
export function readableUserError(error: unknown): ApiError {
  const apiError = toApiError(error);
  const fieldErrors: Record<string, string[]> = {};

  for (const [apiField, messages] of Object.entries(apiError.fieldErrors)) {
    const field = GO_FIELDS[apiField] ?? apiField;
    fieldErrors[field] = messages.map((message) => readableMessage(field, message));
  }
  const matched = MESSAGE_FIELDS.find(({ pattern }) => pattern.test(apiError.message));
  if (matched && !fieldErrors[matched.field]) fieldErrors[matched.field] = [matched.message];

  return new ApiError({
    kind: apiError.kind,
    status: apiError.status,
    message: apiError.message,
    fieldErrors,
    cause: apiError,
  });
}
