import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { RecordedRequest } from '@/test/fakeAdapter';
import { renderApp } from '@/test/renderApp';

import RolesPage from './RolesPage';

const PERMISSIONS = ['roles:assign', 'roles:read', 'users:read'];
const ADMIN = { id: 'role-admin', name: 'admin', permissions: PERMISSIONS };
const DCFP = { id: 'role-dcfp', name: 'dfcp', permissions: ['users:read'] };

interface Reply {
  status: number;
  body?: unknown;
}

function api(write: (request: RecordedRequest) => Reply = () => ({ status: 200, body: {} })) {
  return (request: RecordedRequest): Reply => {
    if (request.method !== 'GET') return write(request);
    if (request.url === '/roles')
      return { status: 200, body: { success: true, data: [ADMIN, DCFP] } };
    if (request.url === '/permissions')
      return { status: 200, body: { success: true, data: PERMISSIONS } };
    return {
      status: 200,
      body: {
        success: true,
        data: { users: [{ id: 'u-1', roles: [DCFP] }], limit: 100, offset: 0 },
      },
    };
  };
}

describe('RolesPage', () => {
  it('shows the role picked in the address with a switch per permission, grouped', async () => {
    renderApp(<RolesPage />, {
      route: '/moh/users/roles?role=role-dcfp',
      signedIn: true,
      replies: [api()],
    });

    expect(
      await screen.findByRole('heading', { name: 'District focal person' }),
    ).toBeInTheDocument();
    const roles = screen.getByRole('navigation', { name: 'Roles' });
    expect(within(roles).getByRole('link', { name: /District focal person/ })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(within(roles).getByRole('link', { name: /District focal person/ })).toHaveTextContent(
      '1 user',
    );
    expect(screen.getByRole('region', { name: 'Users' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /List users and view user accounts/ })).toBeChecked();
    expect(screen.getByRole('switch', { name: /Assign roles to users/ })).not.toBeChecked();
  });

  it('grants a permission by sending the whole new list', async () => {
    const user = userEvent.setup();
    const { requests } = renderApp(<RolesPage />, {
      route: '/moh/users/roles?role=role-dcfp',
      signedIn: true,
      replies: [api(() => ({ status: 200, body: { success: true } }))],
    });

    await user.click(await screen.findByRole('switch', { name: /Assign roles to users/ }));

    await waitFor(() => {
      expect(requests.find((request) => request.method === 'PUT')).toMatchObject({
        url: '/roles/role-dcfp/permissions',
        body: { permissions: ['users:read', 'roles:assign'] },
      });
    });
  });

  it('shows why a change was refused', async () => {
    const user = userEvent.setup();
    renderApp(<RolesPage />, {
      route: '/moh/users/roles?role=role-dcfp',
      signedIn: true,
      replies: [
        api(() => ({ status: 422, body: { success: false, message: 'unknown permission' } })),
      ],
    });

    await user.click(await screen.findByRole('switch', { name: /Assign roles to users/ }));

    expect(await screen.findByText('unknown permission')).toBeInTheDocument();
  });

  it('locks the administrator role, which the server will not change', async () => {
    renderApp(<RolesPage />, { route: '/moh/users/roles', signedIn: true, replies: [api()] });

    expect(await screen.findByText('This role cannot be changed')).toBeInTheDocument();
    for (const toggle of screen.getAllByRole('switch')) expect(toggle).toBeDisabled();
  });
});
