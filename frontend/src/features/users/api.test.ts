import { describe, expect, it, vi } from 'vitest';

import { createHttpClient } from '@/lib/api';
import { createFakeAdapter } from '@/test/fakeAdapter';

import {
  createUser,
  listPermissions,
  listRoles,
  listUserSessions,
  listUsers,
  revokeUserSessions,
  setRolePermissions,
  setUserRoles,
  setUserStatus,
  summariseUsers,
  type NewUserInput,
} from './api';

function setup(...script: Parameters<typeof createFakeAdapter>) {
  const { adapter, requests } = createFakeAdapter(...script);
  const http = createHttpClient({
    baseUrl: '/api',
    getToken: () => 'tok',
    onUnauthorized: vi.fn(),
    adapter,
  });
  return { http, requests };
}

const ADMIN_ROLE = {
  id: '00000000-0000-4000-8001-000000000001',
  name: 'admin',
  permissions: ['users:read'],
};
const VHT_ROLE = { id: '00000000-0000-4000-8001-000000000011', name: 'vht', permissions: [] };

const input: NewUserInput = {
  username: 'nakato',
  firstname: 'Sarah',
  lastname: 'Nakato',
  email: 'sarah@example.org',
  password: 'correct horse',
  phone_number: '+256700000001',
  role_ids: [VHT_ROLE.id],
};

const goPage = (users: unknown[], offset = 0) => ({
  status: 200,
  body: {
    success: true,
    message: 'users retrieved',
    data: { users, limit: 100, offset },
  },
});

describe('listUsers', () => {
  it('reads the paged Go API envelope, keeping every role the user holds', async () => {
    const { http, requests } = setup(
      goPage([
        {
          id: '00000000-0000-4000-8002-000000000001',
          username: 'admin',
          email: 'admin@example.org',
          firstname: '',
          lastname: '',
          phone_number: '',
          status: 'active',
          role: ADMIN_ROLE,
          roles: [ADMIN_ROLE, VHT_ROLE],
        },
      ]),
    );

    const users = await listUsers(http);
    expect(requests[0]?.url).toBe('/users?limit=100&offset=0');
    expect(users).toEqual([
      {
        id: '00000000-0000-4000-8002-000000000001',
        username: 'admin',
        email: 'admin@example.org',
        firstname: null,
        lastname: null,
        phone_number: null,
        status: 'active',
        role: 'admin',
        roles: [ADMIN_ROLE, VHT_ROLE],
      },
    ]);
  });

  it('reads the next page while pages come back full', async () => {
    const full = Array.from({ length: 100 }, (_, index) => ({ id: `u-${index}`, roles: [] }));
    const { http, requests } = setup(goPage(full), goPage([{ id: 'u-100', roles: [] }], 100));

    const users = await listUsers(http);
    expect(users).toHaveLength(101);
    expect(requests.map((request) => request.url)).toEqual([
      '/users?limit=100&offset=0',
      '/users?limit=100&offset=100',
    ]);
  });

  it('treats a null list as no users', async () => {
    const { http } = setup(goPage([]), {
      status: 200,
      body: { success: true, data: { users: null } },
    });
    await expect(listUsers(http)).resolves.toEqual([]);
  });

  it('falls back to the primary role when the list of roles is missing', async () => {
    const { http } = setup(goPage([{ id: 'u-1', role: VHT_ROLE }]));
    const [user] = await listUsers(http);
    expect(user?.roles).toEqual([VHT_ROLE]);
    expect(user?.role).toBe('vht');
  });

  it('never keeps a password the API happens to return', async () => {
    const { http } = setup(goPage([{ id: 'u-1', username: 'u', password: 'hunter2' }]));
    const [user] = await listUsers(http);
    expect(user).not.toHaveProperty('password');
  });

  it('rejects a response that is not a list', async () => {
    const { http } = setup({ status: 200, body: { message: 'ok' } });
    await expect(listUsers(http)).rejects.toMatchObject({ kind: 'unexpected_response' });
  });
});

describe('createUser', () => {
  it('posts the form values with the role ids', async () => {
    const { http, requests } = setup({
      status: 201,
      body: { success: true, data: { user_id: 'new-id' } },
    });
    await createUser(http, input);
    expect(requests[0]).toMatchObject({ method: 'POST', url: '/users', body: input });
  });

  it('puts Go validation failures under the form field names, in words a person can act on', async () => {
    const { http } = setup({
      status: 422,
      body: {
        success: false,
        message: 'validation failed',
        error: {
          Username: 'failed on validation rule: min',
          Phone: 'failed on validation rule: max',
          RoleIDs: 'failed on validation rule: uuid_rfc4122',
        },
      },
    });
    await expect(createUser(http, input)).rejects.toMatchObject({
      kind: 'validation',
      fieldErrors: {
        username: ['Use at least 3 characters.'],
        phone_number: ['Enter the number as +256 followed by 9 digits.'],
        role_ids: ['Choose at least one role from the list.'],
      },
    });
  });

  it('places a duplicate email beside the email field', async () => {
    const { http } = setup({
      status: 409,
      body: { success: false, message: 'email already exists' },
    });
    await expect(createUser(http, input)).rejects.toMatchObject({
      kind: 'conflict',
      fieldErrors: { email: ['An account with this email address already exists.'] },
    });
  });
});

describe('user access writes', () => {
  it('replaces the roles a user holds', async () => {
    const { http, requests } = setup({ status: 200, body: { success: true } });
    await setUserRoles(http, 'u-7', [VHT_ROLE.id]);
    expect(requests[0]).toMatchObject({
      method: 'PUT',
      url: '/users/u-7/roles',
      body: { role_ids: [VHT_ROLE.id] },
    });
  });

  it('sets the status', async () => {
    const { http, requests } = setup({ status: 200, body: { success: true } });
    await setUserStatus(http, 'u-7', 'disabled');
    expect(requests[0]).toMatchObject({
      method: 'PATCH',
      url: '/users/u-7/status',
      body: { status: 'disabled' },
    });
  });

  it('reports the last-admin refusal as the server words it', async () => {
    const { http } = setup({
      status: 409,
      body: { success: false, message: 'cannot disable or demote the last active admin' },
    });
    await expect(setUserStatus(http, 'u-1', 'disabled')).rejects.toMatchObject({
      kind: 'conflict',
      message: 'cannot disable or demote the last active admin',
    });
  });
});

describe('roles and permissions', () => {
  it('lists roles with their permission codes', async () => {
    const { http } = setup({
      status: 200,
      body: { success: true, data: [ADMIN_ROLE, { ...VHT_ROLE, permissions: null }] },
    });
    await expect(listRoles(http)).resolves.toEqual([ADMIN_ROLE, VHT_ROLE]);
  });

  it('lists permission codes', async () => {
    const { http } = setup({ status: 200, body: { success: true, data: ['users:read'] } });
    await expect(listPermissions(http)).resolves.toEqual(['users:read']);
  });

  it("replaces a role's permissions", async () => {
    const { http, requests } = setup({ status: 200, body: { success: true } });
    await setRolePermissions(http, VHT_ROLE.id, ['users:read']);
    expect(requests[0]).toMatchObject({
      method: 'PUT',
      url: `/roles/${VHT_ROLE.id}/permissions`,
      body: { permissions: ['users:read'] },
    });
  });
});

describe('summariseUsers', () => {
  const user = (status: string | null) => ({ status });

  it('counts active users case-insensitively and everyone else as inactive', () => {
    expect(summariseUsers([user('active'), user('Active'), user('disabled'), user(null)])).toEqual({
      total: 4,
      active: 2,
      inactive: 2,
    });
  });

  it('reports zeros for an empty list', () => {
    expect(summariseUsers([])).toEqual({ total: 0, active: 0, inactive: 0 });
  });
});

describe('user sessions', () => {
  const USER_ID = '00000000-0000-4000-8002-000000000007';
  const session = {
    id: '00000000-0000-4000-8003-000000000001',
    user_agent: 'okhttp/4.12.0',
    ip_address: null,
    created_at: '2026-11-18T08:00:00Z',
    last_seen_at: '2026-11-20T09:30:00Z',
    expires_at: '2026-12-18T08:00:00Z',
    revoked_at: null,
    refreshed_at: null,
    refresh_count: 0,
    current: false,
  };

  it('lists where a user is signed in from GET /users/:id/sessions', async () => {
    const { http, requests } = setup({ status: 200, body: { success: true, data: [session] } });
    const sessions = await listUserSessions(http, USER_ID);
    expect(requests[0]).toMatchObject({ method: 'GET', url: `/users/${USER_ID}/sessions` });
    expect(sessions).toEqual([
      {
        id: session.id,
        user_agent: 'okhttp/4.12.0',
        ip_address: null,
        created_at: session.created_at,
        last_seen_at: session.last_seen_at,
        expires_at: session.expires_at,
        revoked_at: null,
        current: false,
      },
    ]);
  });

  it('signs a user out everywhere with DELETE /users/:id/sessions and returns the count', async () => {
    const { http, requests } = setup({
      status: 200,
      body: { success: true, message: 'sessions revoked', data: { revoked: 3 } },
    });
    await expect(revokeUserSessions(http, USER_ID)).resolves.toBe(3);
    expect(requests[0]).toMatchObject({ method: 'DELETE', url: `/users/${USER_ID}/sessions` });
  });

  it('refuses a reply without a count', async () => {
    const { http } = setup({ status: 200, body: { success: true, data: null } });
    await expect(revokeUserSessions(http, USER_ID)).rejects.toMatchObject({
      kind: 'unexpected_response',
    });
  });
});
