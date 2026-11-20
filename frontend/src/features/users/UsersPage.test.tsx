import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { RecordedRequest } from '@/test/fakeAdapter';
import { testRouter } from '@/test/navigation';
import { renderApp } from '@/test/renderApp';

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
