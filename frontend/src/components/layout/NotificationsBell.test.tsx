import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

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
});
