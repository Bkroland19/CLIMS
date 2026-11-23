import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderApp, sessionWith } from '@/test/renderApp';

import { useCan, useCurrentUserSync } from './queries';

/** Shows whether the signed-in user may change role permissions, after syncing with the server. */
function Probe() {
  useCurrentUserSync();
  const can = useCan();
  return <p>{can('roles:manage') ? 'can manage roles' : 'cannot manage roles'}</p>;
}

describe('useCurrentUserSync', () => {
  it("applies the server's current roles and permissions to the signed-in user", async () => {
    const { store, requests } = renderApp(<Probe />, {
      session: sessionWith(['roles:read']),
      replies: [
        {
          status: 200,
          body: {
            success: true,
            data: {
              id: '1',
              username: 'snakato',
              roles: [{ id: 'r-1', name: 'admin', permissions: ['roles:manage', 'roles:read'] }],
            },
          },
        },
      ],
    });

    expect(screen.getByText('cannot manage roles')).toBeInTheDocument();
    expect(await screen.findByText('can manage roles')).toBeInTheDocument();
    expect(requests[0]).toMatchObject({ method: 'GET', url: '/auth/me' });
    expect(store.getState().auth.session?.user).toMatchObject({
      role: 'admin',
      permissions: ['roles:manage', 'roles:read'],
    });
    expect(store.getState().auth.session?.token).toBe('test-token');
  });

  it('signs out an account that has been deactivated', async () => {
    const { store } = renderApp(<Probe />, {
      signedIn: true,
      replies: [{ status: 403, body: { success: false, message: 'account is disabled' } }],
    });

    await waitFor(() => {
      expect(store.getState().auth.session).toBeNull();
    });
  });

  it('keeps the session when /auth/me fails for another reason', async () => {
    const { store, requests } = renderApp(<Probe />, {
      signedIn: true,
      replies: [{ status: 200, body: { success: true, data: { unexpected: true } } }],
    });

    await waitFor(() => {
      expect(requests).toHaveLength(1);
    });
    expect(store.getState().auth.session).not.toBeNull();
  });
});
