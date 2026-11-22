import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useOrders } from '@/features/district/queries';

import { testRouter } from '@/test/navigation';
import { renderApp } from '@/test/renderApp';

import { InboxBell } from './InboxBell';
import type { InboxWorkspace } from './display';
import { UNREAD_POLL_MS } from './queries';

const ok = (data: unknown) => ({ status: 200, body: { success: true, data } });

const stockout = {
  id: 'n1',
  type: 'order.stockout_reported',
  title: 'Stockout at Kasenyi landing site',
  body: 'Kasenyi landing site reported a stockout of Engabu Free Male.',
  resource_type: 'order',
  resource_id: 'o1',
  actor_id: 'u2',
  data: {},
  read_at: null,
  created_at: '2026-11-21T07:00:00Z',
};
const delivered = {
  ...stockout,
  id: 'n2',
  type: 'order.delivered',
  title: 'Stock delivered to Kasenyi landing site',
  body: '40 boxes of Engabu Free Male were delivered to Kasenyi landing site.',
  read_at: '2026-11-20T09:00:00Z',
  created_at: '2026-11-20T08:00:00Z',
};

/** The inbox API, by address: the count, the list, and marking read. */
function inboxApi(unread: number, items: object[]) {
  return (request: { method: string; url: string }) => {
    if (request.url === '/notifications/read-all') return ok({ marked: unread });
    if (request.method === 'POST') return { status: 200, body: { success: true } };
    if (request.url === '/notifications/unread-count') return ok({ unread });
    if (request.url.startsWith('/notifications?')) return ok(items);
    return ok([]);
  };
}

const dcfp = (workspace: InboxWorkspace) => workspace === 'dcfp';
const listRequests = (requests: { url: string }[]) =>
  requests.filter((request) => request.url.startsWith('/notifications?'));

/** A page on screen that reads the district's queue, as the sidebar badges do. */
function QueueReader() {
  useOrders('queued');
  return null;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('InboxBell', () => {
  it('shows the unread count and loads the list only when it is opened', async () => {
    const user = userEvent.setup();
    const { requests } = renderApp(<InboxBell canOpen={dcfp} />, {
      signedIn: true,
      replies: [inboxApi(1, [stockout, delivered])],
    });

    const bell = await screen.findByRole('button', { name: 'Notifications, 1 new' });
    expect(listRequests(requests)).toHaveLength(0);

    await user.click(bell);

    expect(
      await screen.findByRole('link', { name: /Unread:\s*Stockout at Kasenyi landing site/ }),
    ).toHaveAttribute('href', '/dcfp/orders/o1');
    expect(screen.getByText(/were delivered to Kasenyi landing site/)).toBeInTheDocument();
    expect(listRequests(requests)).toHaveLength(1);
  });

  it('opens a notification’s page and marks it read', async () => {
    const user = userEvent.setup();
    const { requests } = renderApp(<InboxBell canOpen={dcfp} />, {
      signedIn: true,
      replies: [inboxApi(1, [stockout, delivered])],
    });

    await user.click(await screen.findByRole('button', { name: 'Notifications, 1 new' }));
    await user.click(await screen.findByRole('link', { name: /Stockout at Kasenyi/ }));

    await waitFor(() => {
      expect(requests).toContainEqual(
        expect.objectContaining({ method: 'POST', url: '/notifications/n1/read' }),
      );
    });
    expect(testRouter.pathname).toBe('/dcfp/orders/o1');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not mark a notification that was already read', async () => {
    const user = userEvent.setup();
    const { requests } = renderApp(<InboxBell canOpen={dcfp} />, {
      signedIn: true,
      replies: [inboxApi(1, [stockout, delivered])],
    });

    await user.click(await screen.findByRole('button', { name: 'Notifications, 1 new' }));
    await user.click(await screen.findByRole('link', { name: /Stock delivered to Kasenyi/ }));

    expect(testRouter.pathname).toBe('/dcfp/orders/o1');
    expect(requests.some((request) => request.method === 'POST')).toBe(false);
  });

  it('marks everything read', async () => {
    const user = userEvent.setup();
    const { requests } = renderApp(<InboxBell canOpen={dcfp} />, {
      signedIn: true,
      replies: [inboxApi(1, [stockout, delivered])],
    });

    await user.click(await screen.findByRole('button', { name: 'Notifications, 1 new' }));
    await user.click(await screen.findByRole('button', { name: 'Mark all read' }));

    await waitFor(() => {
      expect(requests).toContainEqual(
        expect.objectContaining({ method: 'POST', url: '/notifications/read-all' }),
      );
    });
  });

  it('offers no page the reader cannot open', async () => {
    const user = userEvent.setup();
    renderApp(<InboxBell canOpen={() => false} />, {
      signedIn: true,
      replies: [inboxApi(0, [delivered])],
    });

    await user.click(await screen.findByRole('button', { name: 'Notifications' }));

    expect(
      await screen.findByRole('button', { name: /Stock delivered to Kasenyi/ }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark all read' })).not.toBeInTheDocument();
  });

  it('refreshes the district’s data when a new notification arrives', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let unread = 0;
    const { requests } = renderApp(
      <>
        <InboxBell canOpen={dcfp} />
        <QueueReader />
      </>,
      {
        signedIn: true,
        replies: [
          (request) =>
            request.url === '/notifications/unread-count'
              ? ok({ unread })
              : ok({ items: [], total: 0, limit: 100, offset: 0 }),
        ],
      },
    );
    const orderReads = () => requests.filter((request) => request.url.startsWith('/orders')).length;

    await screen.findByRole('button', { name: 'Notifications' });
    await waitFor(() => {
      expect(orderReads()).toBeGreaterThan(0);
    });
    const before = orderReads();

    unread = 1;
    await act(() => vi.advanceTimersByTimeAsync(UNREAD_POLL_MS));

    expect(await screen.findByRole('button', { name: 'Notifications, 1 new' })).toBeInTheDocument();
    await waitFor(() => {
      expect(orderReads()).toBeGreaterThan(before);
    });
  });
});
