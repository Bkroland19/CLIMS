import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Ban, Copy, Pencil } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';

import { ROW_ACTION_SEPARATOR, RowActions } from './RowActions';

describe('RowActions', () => {
  it('opens from the keyboard and runs the chosen action', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    render(
      <RowActions
        label="Actions for ORD-104"
        actions={[{ label: 'Edit order', icon: Pencil, onSelect: onEdit }]}
      />,
    );

    screen.getByRole('button', { name: 'Actions for ORD-104' }).focus();
    await user.keyboard('{Enter}');
    await user.click(await screen.findByRole('menuitem', { name: 'Edit order' }));

    expect(onEdit).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('splits the menu into groups at each separator', async () => {
    const user = userEvent.setup();
    render(
      <RowActions
        label="Actions for nakato"
        actions={[
          { label: 'Edit user', icon: Pencil, onSelect: vi.fn() },
          { label: 'Copy phone number', icon: Copy, onSelect: vi.fn() },
          ROW_ACTION_SEPARATOR,
          { label: 'Deactivate user', icon: Ban, onSelect: vi.fn(), destructive: true },
        ]}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Actions for nakato' }));
    const menu = await screen.findByRole('menu');

    expect(screen.getAllByRole('menuitem')).toHaveLength(3);
    expect(menu.querySelectorAll('[role="separator"]')).toHaveLength(1);
  });

  it('drops separators that would leave an empty group', async () => {
    const user = userEvent.setup();
    render(
      <RowActions
        label="Actions for nakato"
        actions={[
          ROW_ACTION_SEPARATOR,
          { label: 'Edit user', icon: Pencil, onSelect: vi.fn() },
          ROW_ACTION_SEPARATOR,
          ROW_ACTION_SEPARATOR,
          { label: 'Copy phone number', icon: Copy, onSelect: vi.fn() },
          ROW_ACTION_SEPARATOR,
        ]}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Actions for nakato' }));
    const menu = await screen.findByRole('menu');

    expect(menu.querySelectorAll('[role="separator"]')).toHaveLength(1);
  });
});
