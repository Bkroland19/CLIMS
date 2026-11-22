import { describe, expect, it, vi } from 'vitest';

import { ApiError, createHttpClient } from '@/lib/api';
import { createFakeAdapter } from '@/test/fakeAdapter';

import { completePortalSignIn, signIn } from './api';

function setup(...script: Parameters<typeof createFakeAdapter>) {
  const { adapter, requests } = createFakeAdapter(...script);
  const onUnauthorized = vi.fn();
  const http = createHttpClient({
    baseUrl: '/api',
    getToken: () => 'old',
    onUnauthorized,
    adapter,
  });
  return { http, requests, onUnauthorized };
}

describe('signIn', () => {
  it('returns the session from a successful login', async () => {
    const { http, requests } = setup({
      status: 200,
      body: {
        success: true,
        message: 'login successful',
        data: {
          token: 'tok_9',
          token_type: 'Bearer',
          expires_in: 86400,
          user: {
            id: 2,
            username: 'okello',
            email: 'okello@example.org',
            status: 'active',
            role: { id: 5, name: 'dfcp', permissions: ['users:read'] },
          },
        },
      },
    });

    const session = await signIn(http, { login: 'okello@example.org', password: 'secret' });

    expect(session.token).toBe('tok_9');
    expect(session.user).toMatchObject({ id: '2', username: 'okello', role: 'dfcp' });
    expect(requests[0]).toMatchObject({
      method: 'POST',
      url: '/auth/login',
      body: { login: 'okello@example.org', password: 'secret' },
    });
  });

  it('never sends a previous token with the credentials', async () => {
    const { http, requests } = setup({
      status: 200,
      body: { token: 't', user: { id: 1, username: 'u' } },
    });
    await signIn(http, { login: 'u@example.org', password: 'p' });
    expect(requests[0]?.authorization).toBeNull();
  });

  it('rejects wrong credentials reported in the legacy envelope, without ending a session', async () => {
    const { http, onUnauthorized } = setup({
      status: 200,
      body: { code: '401', message: 'Invalid username or password' },
    });

    await expect(signIn(http, { login: 'u@example.org', password: 'wrong' })).rejects.toMatchObject(
      {
        kind: 'unauthorized',
        message: 'Invalid username or password',
      },
    );
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('rejects a success response that carries no token', async () => {
    const { http } = setup({ status: 200, body: { code: '200', user: { id: 1, username: 'u' } } });
    const failure = signIn(http, { login: 'u@example.org', password: 'p' });
    await expect(failure).rejects.toBeInstanceOf(ApiError);
    await expect(failure).rejects.toMatchObject({ kind: 'unexpected_response' });
  });
});

describe('signIn against the Go API', () => {
  it('rejects a 401 as wrong credentials, without ending a session', async () => {
    const { http, onUnauthorized } = setup({
      status: 401,
      body: { success: false, message: 'invalid credentials' },
    });
    await expect(signIn(http, { login: 'u@example.org', password: 'wrong' })).rejects.toMatchObject(
      { kind: 'unauthorized', message: 'invalid credentials' },
    );
    expect(onUnauthorized).not.toHaveBeenCalled();
  });
});

describe('completePortalSignIn', () => {
  it('claims the handed-off session without sending a stored token', async () => {
    const { http, requests } = setup({
      status: 200,
      body: {
        success: true,
        data: {
          token: 'tok_sso',
          refresh_token: 'refresh_sso',
          user: {
            id: '6f1c2a7e-0000-4000-8000-000000000001',
            username: 'akello',
            role: { id: 2, name: 'dcfp', permissions: [] },
          },
        },
      },
    });

    const session = await completePortalSignIn(http);

    expect(session).toMatchObject({
      token: 'tok_sso',
      refresh_token: 'refresh_sso',
      user: { username: 'akello' },
    });
    expect(requests[0]).toMatchObject({ method: 'POST', url: '/auth/sso/exchange' });
    expect(requests[0]?.authorization).toBeNull();
  });

  it('rejects an expired or reused handoff without ending a local session', async () => {
    const { http, onUnauthorized } = setup({
      status: 401,
      body: { success: false, message: 'start sign-in again from the portal' },
    });
    await expect(completePortalSignIn(http)).rejects.toBeInstanceOf(ApiError);
    expect(onUnauthorized).not.toHaveBeenCalled();
  });
});
