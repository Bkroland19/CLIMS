import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { RecordedRequest } from '@/test/fakeAdapter';
import { testRouter } from '@/test/navigation';
import { renderApp, sessionWith } from '@/test/renderApp';

import UsersPage from './UsersPage';

const ADMIN = { id: 'role-admin', name: 'admin', permissions: ['users:read'] };
const DCFP = { id: 'role-dcfp', name: 'dfcp', permissions: [] };
const VHT = { id: 'role-vht', name: 'vht', permissions: [] };
const roles = [ADMIN, DCFP, VHT];

const users = [
  // id 1 is the signed-in test user.
  {
    id: '1',
    username: 'snakato',
    firstname: 'Sarah',
    lastname: 'Nakato',
    email: 'sarah@example.org',
    status: 'active',
    role: ADMIN,
    roles: [ADMIN],
  },
  {
    id: 'u-7',
    username: 'okello',
    firstname: 'James',
    lastname: 'Okello',
    email: 'james@example.org',
    phone_number: '+256772000007',
    status: 'disabled',
    role: DCFP,
    roles: [DCFP, VHT],
  },
  {
    id: 'u-8',
    username: 'atim',
    firstname: 'Grace',
    lastname: 'Atim',
    email: 'grace@example.org',
    status: 'active',
    role: VHT,
    roles: [VHT],
  },
];

type Reply = { status: number; body?: unknown } | { failure: 'network' };

/**
 * Answers the page's two reads (users, roles) from the fixtures and hands
 * every write to `write`, so the order the queries fire in does not matter.
 */
function api(write: (request: RecordedRequest) => Reply = () => ({ status: 200, body: {} })) {
  return (request: RecordedRequest): Reply => {
    if (request.method === 'GET' && request.url.startsWith('/users')) {
      return { status: 200, body: { success: true, data: { users, limit: 100, offset: 0 } } };
    }
    if (request.method === 'GET' && request.url === '/roles') {
      return { status: 200, body: { success: true, data: roles } };
    }
    return write(request);
  };
}

const writes = (requests: RecordedRequest[]) =>
  requests.filter((request) => request.method !== 'GET');

async function fillNewUser(user: ReturnType<typeof userEvent.setup>) {
  const dialog = await screen.findByRole('dialog');
  await user.type(within(dialog).getByLabelText('First name'), 'Grace');
  await user.type(within(dialog).getByLabelText('Last name'), 'Akello');
  await user.type(within(dialog).getByLabelText('Username'), 'gakello');
  await user.type(within(dialog).getByLabelText('Email'), 'Grace.Akello@Example.org');
  await user.type(within(dialog).getByLabelText(/Phone number/), '0772 100 201');
  await user.type(within(dialog).getByLabelText('Password'), 'a-test-password');
  await user.click(within(dialog).getByRole('checkbox', { name: /^VHT/ }));
  return dialog;
}

describe('UsersPage', () => {
  it('lists users with every role they hold, by name, and their status', async () => {
    renderApp(<UsersPage />, { signedIn: true, replies: [api()] });

    const row = (await screen.findByText('James Okello')).closest('tr');
    if (!row) throw new Error('James Okello has no table row');
    expect(within(row).getByText('District focal person')).toBeInTheDocument();
    expect(within(row).getByText('VHT')).toBeInTheDocument();
    expect(within(row).getByText('Deactivated')).toBeInTheDocument();
  });

  it('filters by status and role from the address, so the view survives a refresh', async () => {
    renderApp(<UsersPage />, {
      route: '/moh/users?status=active&role=role-vht',
      signedIn: true,
      replies: [api()],
    });

    expect(await screen.findByText('Grace Atim')).toBeInTheDocument();
    expect(screen.queryByText('Sarah Nakato')).not.toBeInTheDocument();
    expect(screen.queryByText('James Okello')).not.toBeInTheDocument();
    const tabs = screen.getByRole('navigation', { name: 'Filter users by status' });
    expect(within(tabs).getByRole('link', { name: /Active/ })).toHaveAttribute(
      'aria-current',
      'true',
    );
  });

  it('puts the status filter in the address when a tab is chosen', async () => {
    const user = userEvent.setup();
    renderApp(<UsersPage />, { route: '/moh/users', signedIn: true, replies: [api()] });
    await screen.findByText('James Okello');

    const tabs = screen.getByRole('navigation', { name: 'Filter users by status' });
    await user.click(within(tabs).getByRole('link', { name: /Deactivated/ }));

    expect(testRouter.location).toBe('/moh/users?status=disabled');
    await waitFor(() => {
      expect(screen.queryByText('Grace Atim')).not.toBeInTheDocument();
    });
    expect(screen.getByText('James Okello')).toBeInTheDocument();
  });

  it('creates a user with the roles ticked, sending the phone in +256 form', async () => {
    const user = userEvent.setup();
    const { requests } = renderApp(<UsersPage />, {
      signedIn: true,
      replies: [api(() => ({ status: 201, body: { success: true, data: { user_id: 'new' } } }))],
    });
    await screen.findByText('James Okello');

    await user.click(screen.getByRole('button', { name: 'Add user' }));
    const dialog = await fillNewUser(user);
    await user.click(within(dialog).getByRole('button', { name: 'Create user' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(writes(requests)).toEqual([
      expect.objectContaining({
        method: 'POST',
        url: '/users',
        body: {
          username: 'gakello',
          email: 'grace.akello@example.org',
          password: 'a-test-password',
          firstname: 'Grace',
          lastname: 'Akello',
          phone_number: '+256772100201',
          role_ids: ['role-vht'],
        },
      }),
    ]);
  });

  it('checks the form before sending anything', async () => {
    const user = userEvent.setup();
    const { requests } = renderApp(<UsersPage />, { signedIn: true, replies: [api()] });
    await screen.findByText('James Okello');

    await user.click(screen.getByRole('button', { name: 'Add user' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Phone number/), '+254 712 345 678');
    await user.click(within(dialog).getByRole('button', { name: 'Create user' }));

    expect(await within(dialog).findByText('Enter a first name.')).toBeInTheDocument();
    expect(
      within(dialog).getByText('Enter a Ugandan mobile number, e.g. +256 772 123 456.'),
    ).toBeInTheDocument();
    expect(within(dialog).getByText('Choose at least one role.')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Username')).toHaveAttribute('aria-invalid', 'true');
    expect(writes(requests)).toEqual([]);
  });

  it('shows a Go validation failure beside the field it is about and keeps the form open', async () => {
    const user = userEvent.setup();
    renderApp(<UsersPage />, {
      signedIn: true,
      replies: [
        api(() => ({
          status: 422,
          body: {
            success: false,
            message: 'validation failed',
            error: { Username: 'failed on validation rule: min' },
          },
        })),
      ],
    });
    await screen.findByText('James Okello');

    await user.click(screen.getByRole('button', { name: 'Add user' }));
    const dialog = await fillNewUser(user);
    await user.click(within(dialog).getByRole('button', { name: 'Create user' }));

    expect(await within(dialog).findByText('Use at least 3 characters.')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Username')).toHaveAttribute('aria-invalid', 'true');
    expect(within(dialog).getByLabelText('First name')).toHaveValue('Grace');
  });

  it('shows a duplicate email beside the email field', async () => {
    const user = userEvent.setup();
    renderApp(<UsersPage />, {
      signedIn: true,
      replies: [
        api(() => ({ status: 409, body: { success: false, message: 'email already exists' } })),
      ],
    });
    await screen.findByText('James Okello');

    await user.click(screen.getByRole('button', { name: 'Add user' }));
    const dialog = await fillNewUser(user);
    await user.click(within(dialog).getByRole('button', { name: 'Create user' }));

    expect(
      await within(dialog).findByText('An account with this email address already exists.'),
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
  });

  it('reports a failure that belongs to no field inside the dialog, and keeps what was typed', async () => {
    const user = userEvent.setup();
    const { onMutationError } = renderApp(<UsersPage />, {
      signedIn: true,
      replies: [api(() => ({ failure: 'network' }))],
    });
    await screen.findByText('James Okello');

    await user.click(screen.getByRole('button', { name: 'Add user' }));
    const dialog = await fillNewUser(user);
    await user.click(within(dialog).getByRole('button', { name: 'Create user' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Could not reach the server. Check your connection and try again.',
    );
    expect(within(dialog).getByLabelText('Username')).toHaveValue('gakello');
    // Shown in place, so the global toast must not announce it a second time.
    expect(onMutationError).not.toHaveBeenCalled();
  });

  it('never asks for or shows a password outside the create form', async () => {
    const user = userEvent.setup();
    renderApp(<UsersPage />, { signedIn: true, replies: [api()] });
    await screen.findByText('James Okello');

    await user.click(screen.getByRole('button', { name: 'Actions for James Okello' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Edit roles' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByLabelText(/password/i)).not.toBeInTheDocument();
  });

  it("replaces a user's roles", async () => {
    const user = userEvent.setup();
    const { requests } = renderApp(<UsersPage />, {
      signedIn: true,
      replies: [api(() => ({ status: 200, body: { success: true } }))],
    });
    await screen.findByText('James Okello');

    await user.click(screen.getByRole('button', { name: 'Actions for James Okello' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Edit roles' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('checkbox', { name: /^District focal person/ })).toBeChecked();
    await user.click(within(dialog).getByRole('checkbox', { name: /^District focal person/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Save roles' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(writes(requests)).toEqual([
      expect.objectContaining({
        method: 'PUT',
        url: '/users/u-7/roles',
        body: { role_ids: ['role-vht'] },
      }),
    ]);
  });

  it('does not offer to deactivate the account you are signed in with', async () => {
    const user = userEvent.setup();
    renderApp(<UsersPage />, { signedIn: true, replies: [api()] });
    await screen.findByText('Sarah Nakato');

    await user.click(screen.getByRole('button', { name: 'Actions for Sarah Nakato' }));
    expect(await screen.findByRole('menuitem', { name: 'Edit roles' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Deactivate user' })).not.toBeInTheDocument();
  });

  it('deactivates only after confirmation', async () => {
    const user = userEvent.setup();
    const { requests } = renderApp(<UsersPage />, {
      signedIn: true,
      replies: [api(() => ({ status: 200, body: { success: true } }))],
    });
    await screen.findByText('Grace Atim');

    await user.click(screen.getByRole('button', { name: 'Actions for Grace Atim' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Deactivate user' }));
    const confirm = await screen.findByRole('alertdialog');
    expect(confirm).toHaveTextContent('Deactivate Grace Atim?');
    expect(writes(requests)).toEqual([]);

    await user.click(within(confirm).getByRole('button', { name: 'Deactivate user' }));

    await waitFor(() => {
      expect(writes(requests)).toEqual([
        expect.objectContaining({
          method: 'PATCH',
          url: '/users/u-8/status',
          body: { status: 'disabled' },
        }),
      ]);
    });
  });

  it('keeps the confirmation open and explains when the server refuses', async () => {
    const user = userEvent.setup();
    renderApp(<UsersPage />, {
      signedIn: true,
      replies: [
        api(() => ({
          status: 409,
          body: { success: false, message: 'cannot disable or demote the last active admin' },
        })),
      ],
    });
    await screen.findByText('Grace Atim');

    await user.click(screen.getByRole('button', { name: 'Actions for Grace Atim' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Deactivate user' }));
    const confirm = await screen.findByRole('alertdialog');
    await user.click(within(confirm).getByRole('button', { name: 'Deactivate user' }));

    expect(await within(confirm).findByRole('alert')).toHaveTextContent(
      'cannot disable or demote the last active admin',
    );
  });

  it('reactivates a deactivated user straight away', async () => {
    const user = userEvent.setup();
    const { requests } = renderApp(<UsersPage />, {
      signedIn: true,
      replies: [api(() => ({ status: 200, body: { success: true } }))],
    });
    await screen.findByText('James Okello');

    await user.click(screen.getByRole('button', { name: 'Actions for James Okello' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Reactivate user' }));

    await waitFor(() => {
      expect(writes(requests)).toEqual([
        expect.objectContaining({ url: '/users/u-7/status', body: { status: 'active' } }),
      ]);
    });
  });

  it('shows an error with a retry when the users cannot be loaded', async () => {
    renderApp(<UsersPage />, { signedIn: true, replies: [{ status: 500, body: {} }] });
    expect(await screen.findByRole('button', { name: /try again/i })).toBeInTheDocument();
  });
});

describe('UsersPage permissions', () => {
  it('leaves out adding users and editing roles for someone who may only read', async () => {
    const user = userEvent.setup();
    renderApp(<UsersPage />, { session: sessionWith(['users:read']), replies: [api()] });

    const row = (await screen.findByText('Grace Atim')).closest('tr');
    if (!row) throw new Error('Grace Atim has no table row');
    expect(screen.queryByRole('button', { name: 'Add user' })).not.toBeInTheDocument();

    await user.click(within(row).getByRole('button', { name: 'Actions for Grace Atim' }));
    expect(await screen.findByRole('menuitem', { name: 'Signed-in devices' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Edit roles' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Deactivate user' })).not.toBeInTheDocument();
  });

  it('needs both users:create and roles:assign to add a user, as the API does', async () => {
    renderApp(<UsersPage />, {
      session: sessionWith(['users:read', 'users:create']),
      replies: [api()],
    });
    await screen.findByText('Grace Atim');
    expect(screen.queryByRole('button', { name: 'Add user' })).not.toBeInTheDocument();
  });
});

describe("UsersPage: a user's signed-in devices", () => {
  const sessions = [
    {
      id: '00000000-0000-4000-8003-000000000101',
      user_agent: 'okhttp/4.12.0',
      ip_address: '41.210.143.92',
      created_at: '2026-11-18T08:00:00Z',
      last_seen_at: '2026-11-20T09:30:00Z',
      expires_at: '2099-12-18T08:00:00Z',
      revoked_at: null,
      current: false,
    },
    {
      id: '00000000-0000-4000-8003-000000000102',
      user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0 Safari/537.36',
      ip_address: null,
      created_at: '2026-11-19T08:00:00Z',
      last_seen_at: '2026-11-19T17:00:00Z',
      expires_at: '2099-12-19T08:00:00Z',
      revoked_at: null,
      current: false,
    },
    {
      id: '00000000-0000-4000-8003-000000000103',
      user_agent: 'curl/8.5.0',
      ip_address: null,
      created_at: '2026-11-17T08:00:00Z',
      last_seen_at: '2026-11-17T09:00:00Z',
      expires_at: '2099-12-17T08:00:00Z',
      revoked_at: '2026-11-17T09:00:00Z',
      current: false,
    },
  ];

  /** The page's reads, plus the sessions of u-8 until they are signed out. */
  function sessionsApi(
    revoke: () => Reply = () => ({ status: 200, body: { success: true, data: { revoked: 2 } } }),
  ) {
    let signedOut = false;
    const page = api();
    return (request: RecordedRequest): Reply => {
      if (request.url === '/users/u-8/sessions') {
        if (request.method === 'GET') {
          return { status: 200, body: { success: true, data: signedOut ? [] : sessions } };
        }
        const reply = revoke();
        if ('status' in reply && reply.status === 200) signedOut = true;
        return reply;
      }
      return page(request);
    };
  }

  async function openDevices(user: ReturnType<typeof userEvent.setup>, name = 'Grace Atim') {
    const row = (await screen.findByText(name)).closest('tr');
    if (!row) throw new Error(`${name} has no table row`);
    await user.click(within(row).getByRole('button', { name: `Actions for ${name}` }));
    await user.click(await screen.findByRole('menuitem', { name: 'Signed-in devices' }));
    return screen.findByRole('dialog', { name: 'Signed-in devices' });
  }

  it('lists the devices still signed in, leaving out signed-out ones', async () => {
    const user = userEvent.setup();
    renderApp(<UsersPage />, { signedIn: true, replies: [sessionsApi()] });

    const dialog = await openDevices(user);
    expect(within(dialog).getByText('Where Grace Atim is signed in now.')).toBeInTheDocument();
    const list = await within(dialog).findByRole('list', {
      name: 'Devices signed in as Grace Atim',
    });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Android app');
    expect(rows[0]).toHaveTextContent('IP 41.210.143.92');
    expect(rows[1]).toHaveTextContent('Chrome on Windows');
    expect(within(dialog).queryByText('curl')).not.toBeInTheDocument();
  });

  it('signs the user out everywhere after confirmation', async () => {
    const user = userEvent.setup();
    const { requests } = renderApp(<UsersPage />, { signedIn: true, replies: [sessionsApi()] });

    const dialog = await openDevices(user);
    await within(dialog).findByRole('list', { name: /Devices signed in/ });
    await user.click(within(dialog).getByRole('button', { name: 'Sign out everywhere' }));

    const confirm = await screen.findByRole('alertdialog', {
      name: 'Sign Grace Atim out everywhere?',
    });
    expect(confirm).toHaveTextContent('This ends their session on 2 devices.');
    expect(writes(requests)).toEqual([]);
    await user.click(within(confirm).getByRole('button', { name: 'Sign out everywhere' }));

    await waitFor(() => {
      expect(writes(requests)).toMatchObject([{ method: 'DELETE', url: '/users/u-8/sessions' }]);
    });
    expect(await within(dialog).findByText('Not signed in anywhere')).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('keeps the confirmation open and explains when the server refuses', async () => {
    const user = userEvent.setup();
    renderApp(<UsersPage />, {
      signedIn: true,
      replies: [
        sessionsApi(() => ({ status: 403, body: { success: false, message: 'forbidden' } })),
      ],
    });

    const dialog = await openDevices(user);
    await within(dialog).findByRole('list', { name: /Devices signed in/ });
    await user.click(within(dialog).getByRole('button', { name: 'Sign out everywhere' }));
    const confirm = await screen.findByRole('alertdialog');
    await user.click(within(confirm).getByRole('button', { name: 'Sign out everywhere' }));

    expect(await within(confirm).findByRole('alert')).toHaveTextContent('forbidden');
  });

  it("returns focus to the row's actions button when closed", async () => {
    const user = userEvent.setup();
    renderApp(<UsersPage />, { signedIn: true, replies: [sessionsApi()] });

    const dialog = await openDevices(user);
    await within(dialog).findByRole('list', { name: /Devices signed in/ });
    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Actions for Grace Atim' })).toHaveFocus();
  });

  it('only shows the devices to someone without users:update', async () => {
    const user = userEvent.setup();
    renderApp(<UsersPage />, { session: sessionWith(['users:read']), replies: [sessionsApi()] });

    const dialog = await openDevices(user);
    await within(dialog).findByRole('list', { name: /Devices signed in/ });
    expect(
      within(dialog).queryByRole('button', { name: 'Sign out everywhere' }),
    ).not.toBeInTheDocument();
  });

  it('says when the devices cannot be loaded, with a retry', async () => {
    const user = userEvent.setup();
    const page = api();
    renderApp(<UsersPage />, {
      signedIn: true,
      replies: [
        (request) =>
          request.url.endsWith('/sessions') ? { status: 500, body: {} } : page(request),
      ],
    });

    const dialog = await openDevices(user);
    expect(await within(dialog).findByText('Could not load signed-in devices')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
