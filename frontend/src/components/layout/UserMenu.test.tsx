import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { FakeReply, RecordedRequest } from '@/test/fakeAdapter';
import { renderApp } from '@/test/renderApp';

import { UserMenu } from './UserMenu';

const CHROME =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const session = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  user_agent: CHROME,
  ip_address: '127.0.0.1',
  created_at: '2026-11-20T08:00:00Z',
  last_seen_at: '2026-11-20T08:05:00Z',
  expires_at: '2099-12-20T08:00:00Z',
  revoked_at: null,
  current: false,
  ...overrides,
});

const THIS = session('00000000-0000-4000-8003-000000000001', { current: true });
const PHONE = session('00000000-0000-4000-8003-000000000002', {
  user_agent: 'okhttp/4.12.0',
  ip_address: '41.210.143.92',
});

/** The user's own sessions, with DELETE answered by `revoke` and removing the session on success. */
function devicesApi(revoke: () => { status: number; body?: unknown } = () => ({ status: 200 })) {
  let sessions = [THIS, PHONE];
  return (
    request: RecordedRequest,
  ): ReturnType<Extract<FakeReply, (r: RecordedRequest) => unknown>> => {
    if (request.method === 'GET' && request.url === '/auth/sessions') {
      return { status: 200, body: { success: true, data: sessions } };
    }
    if (request.method === 'DELETE' && request.url.startsWith('/auth/sessions/')) {
      const reply = revoke();
      if (reply.status === 200) {
        sessions = sessions.filter((item) => !request.url.endsWith(item.id));
      }
      return reply;
    }
    return { status: 404, body: {} };
  };
}

async function openDevices(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /account menu/ }));
  await user.click(await screen.findByRole('menuitem', { name: 'Signed-in devices' }));
  return screen.findByRole('dialog', { name: 'Signed-in devices' });
}

describe('UserMenu: signed-in devices', () => {
  it('lists the devices signed in to the account, this one first and marked', async () => {
    const user = userEvent.setup();
    renderApp(<UserMenu />, { signedIn: true, replies: [devicesApi()] });

    const dialog = await openDevices(user);
    const rows = within(
      await within(dialog).findByRole('list', { name: 'Your signed-in devices' }),
    ).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    const [thisDevice, phone] = rows;
    if (!thisDevice || !phone) throw new Error('expected two device rows');
    expect(thisDevice).toHaveTextContent('Chrome on Linux');
    expect(thisDevice).toHaveTextContent('This device');
    expect(thisDevice).toHaveTextContent('Active now');
    expect(within(thisDevice).queryByRole('button')).not.toBeInTheDocument();
    expect(phone).toHaveTextContent('Android app');
  });

  it('signs another device out and keeps focus in the dialog', async () => {
    const user = userEvent.setup();
    const { requests } = renderApp(<UserMenu />, { signedIn: true, replies: [devicesApi()] });

    const dialog = await openDevices(user);
    await user.click(await within(dialog).findByRole('button', { name: 'Sign out, Android app' }));

    await waitFor(() => {
      expect(requests.find((request) => request.method === 'DELETE')).toMatchObject({
        url: `/auth/sessions/${PHONE.id}`,
      });
    });
    await waitFor(() => {
      expect(within(dialog).queryByText('Android app')).not.toBeInTheDocument();
    });
    expect(
      within(dialog).getByText('This is the only device signed in to your account.'),
    ).toBeInTheDocument();
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
  });

  it('explains a device that was already signed out elsewhere', async () => {
    const user = userEvent.setup();
    renderApp(<UserMenu />, {
      signedIn: true,
      replies: [
        devicesApi(() => ({ status: 404, body: { success: false, message: 'session not found' } })),
      ],
    });

    const dialog = await openDevices(user);
    await user.click(await within(dialog).findByRole('button', { name: 'Sign out, Android app' }));

    expect(
      await within(dialog).findByText('That device was already signed out.'),
    ).toBeInTheDocument();
  });

  it('returns focus to the account menu button when closed', async () => {
    const user = userEvent.setup();
    renderApp(<UserMenu />, { signedIn: true, replies: [devicesApi()] });

    await openDevices(user);
    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /account menu/ })).toHaveFocus();
  });
});
