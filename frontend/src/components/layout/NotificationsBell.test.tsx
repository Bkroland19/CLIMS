import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { type AppNotification, NotificationsBell } from './NotificationsBell';

const notification = (id: number): AppNotification => ({
  id: String(id),
  text: `Order ORD-10${id} was confirmed`,
  meta: `Sarah Namubiru · ORD-10${id} · ${id} min ago`,
  tone: 'positive',
});

describe('NotificationsBell', () => {
  it('says how many notifications there are in its name, and lists them on click', async () => {
    const user = userEvent.setup();
    render(<NotificationsBell notifications={[notification(1), notification(2)]} />);

    await user.click(screen.getByRole('button', { name: 'Notifications, 2 new' }));

    const list = await screen.findByRole('list');
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(within(list).getByText('Order ORD-101 was confirmed')).toBeInTheDocument();
    expect(within(list).getByText('Sarah Namubiru · ORD-101 · 1 min ago')).toBeInTheDocument();
  });

  it('caps the badge at 9+ but keeps the exact number in its name', () => {
    const many = Array.from({ length: 12 }, (_, index) => notification(index));
    render(<NotificationsBell notifications={many} />);

    const bell = screen.getByRole('button', { name: 'Notifications, 12 new' });
    expect(bell).toHaveTextContent('9+');
  });

  it('shows no badge and an all-clear when the list is empty', async () => {
    const user = userEvent.setup();
    render(<NotificationsBell notifications={[]} />);

    const bell = screen.getByRole('button', { name: 'Notifications' });
    expect(bell).toHaveTextContent('');
    await user.click(bell);

    expect(await screen.findByText("You're all caught up.")).toBeInTheDocument();
  });

  it('does not claim the user is caught up when there is no feed to read', async () => {
    const user = userEvent.setup();
    render(<NotificationsBell />);

    await user.click(screen.getByRole('button', { name: 'Notifications' }));

    expect(await screen.findByText('Notifications are not connected yet.')).toBeInTheDocument();
    expect(screen.queryByText("You're all caught up.")).not.toBeInTheDocument();
  });

  it('opens from the keyboard and closes with Escape, returning focus to the bell', async () => {
    const user = userEvent.setup();
    render(<NotificationsBell notifications={[]} />);

    await user.tab();
    const bell = screen.getByRole('button', { name: 'Notifications' });
    expect(bell).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('dialog')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(bell).toHaveFocus();
  });

  it('counts what is unread, not what is listed, and marks unread entries for screen readers', async () => {
    const user = userEvent.setup();
    render(
      <NotificationsBell
        notifications={[{ ...notification(1), unread: true }, notification(2), notification(3)]}
        unreadCount={1}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Notifications, 1 new' }));

    const list = await screen.findByRole('list');
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    expect(within(list).getByText(/Unread:/).parentElement).toHaveTextContent(
      'Unread: Order ORD-101 was confirmed',
    );
    expect(within(list).getAllByText(/Unread:/)).toHaveLength(1);
  });

  it('opens a notification with a page as a link, reports it, and closes the list', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const linked = {
      ...notification(1),
      unread: true,
      detail: 'Wakiso DCFP confirmed it.',
      href: '/orders/1',
    };
    render(<NotificationsBell notifications={[linked]} onOpenNotification={onOpen} />);

    await user.click(screen.getByRole('button', { name: 'Notifications, 1 new' }));
    const link = await screen.findByRole('link', { name: /Order ORD-101 was confirmed/ });
    expect(link).toHaveAttribute('href', '/orders/1');
    expect(link).toHaveTextContent('Wakiso DCFP confirmed it.');
    await user.click(link);

    expect(onOpen).toHaveBeenCalledWith(linked);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('makes a notification without a page a button that reports it, keeping the list open', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(
      <NotificationsBell
        notifications={[{ ...notification(1), unread: true }]}
        onOpenNotification={onOpen}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Notifications, 1 new' }));
    await user.click(await screen.findByRole('button', { name: /Order ORD-101 was confirmed/ }));

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('shows placeholders while the list loads, then a failure with a way to try again', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const { rerender } = render(<NotificationsBell isLoading unreadCount={2} />);

    await user.click(screen.getByRole('button', { name: 'Notifications, 2 new' }));
    expect(await screen.findByText('Loading notifications…')).toBeInTheDocument();
    expect(screen.queryByText("You're all caught up.")).not.toBeInTheDocument();

    rerender(
      <NotificationsBell unreadCount={2} error={new Error('Network down')} onRetry={onRetry} />,
    );
    expect(await screen.findByText('Could not load notifications')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('puts an action beside the heading and tells the owner when it opens and closes', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <NotificationsBell
        notifications={[]}
        action={<button type="button">Mark all read</button>}
        onOpenChange={onOpenChange}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Notifications' }));
    expect(await screen.findByRole('button', { name: 'Mark all read' })).toBeInTheDocument();
    expect(onOpenChange).toHaveBeenLastCalledWith(true);

    await user.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });
});
