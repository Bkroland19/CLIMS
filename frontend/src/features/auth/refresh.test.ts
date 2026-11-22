import { describe, expect, it } from 'vitest';

import { createHttpClient } from '@/lib/api';
import { createMemoryStorage } from '@/lib/storage/jsonStorage';
import { createAppStore } from '@/store/store';
import { createFakeAdapter } from '@/test/fakeAdapter';

import { selectSession } from './authSlice';
import { createSessionRefresher } from './refresh';
import { createSessionStore, type Session } from './session';

const session: Session = {
  token: 'access-1',
  refresh_token: 'refresh-1',
  user: {
    id: 'c0784d50-241e-4164-97db-9314f5f17c33',
    username: 'snakato',
    role: 'dfcp',
    firstname: null,
    lastname: null,
    email: null,
    permissions: null,
    roleNames: ['dfcp'],
    store_id: null,
  },
};

function setup(saved: Session | null, ...replies: Parameters<typeof createFakeAdapter>) {
  const sessionStore = createSessionStore(
    createMemoryStorage(saved ? { 'clims.session': JSON.stringify(saved) } : {}),
  );
  const store = createAppStore({ sessionStore });
  const { adapter, requests } = createFakeAdapter(...replies);
  const http = createHttpClient({
    baseUrl: '/api',
    getToken: () => null,
    onUnauthorized: () => undefined,
    adapter,
  });
  return { store, sessionStore, requests, refresh: createSessionRefresher(store, () => http) };
}

const renewed = {
  status: 200,
  body: { success: true, data: { token: 'access-2', refresh_token: 'refresh-2' } },
};

describe('createSessionRefresher', () => {
  it('spends the refresh token once for requests rejected together, and saves the new tokens', async () => {
    const { store, sessionStore, requests, refresh } = setup(session, renewed);

    await expect(Promise.all([refresh('access-1'), refresh('access-1')])).resolves.toEqual([
      true,
      true,
    ]);

    expect(requests).toEqual([
      expect.objectContaining({
        url: '/auth/refresh',
        body: { refresh_token: 'refresh-1' },
        authorization: null,
      }),
    ]);
    expect(selectSession(store.getState())).toMatchObject({
      token: 'access-2',
      refresh_token: 'refresh-2',
    });
    expect(sessionStore.load()).toMatchObject({ token: 'access-2', refresh_token: 'refresh-2' });
  });

  it('retries without refreshing when another tab already renewed the token', async () => {
    const { requests, refresh } = setup(session, renewed);

    await expect(refresh('access-0')).resolves.toBe(true);
    expect(requests).toHaveLength(0);
  });

  it('gives up when the session has ended or cannot be refreshed', async () => {
    await expect(setup(null, renewed).refresh('access-1')).resolves.toBe(false);
    await expect(
      setup({ ...session, refresh_token: null }, renewed).refresh('access-1'),
    ).resolves.toBe(false);
    await expect(setup(session, { status: 401 }).refresh('access-1')).resolves.toBe(false);
  });
});
