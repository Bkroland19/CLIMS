import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { TaskList, type TaskItem } from './TaskList';

const COMMON = {
  title: 'Needs your action',
  errorTitle: 'Could not load your tasks',
  loadingLabel: 'Loading tasks…',
  empty: { title: 'Nothing needs you right now', description: 'New requests appear here.' },
};

const TASKS: TaskItem[] = [
  {
    id: 'review',
    status: { label: 'Sent', tone: 'info' },
    title: 'Review WR-31 from Gulu',
    detail: 'Male 8,000',
    action: 'Review request',
    href: '/warehouse/requests/WR-31',
  },
  {
    id: 'stock',
    status: { label: 'Expired', tone: 'negative' },
    title: 'Remove 1 expired batch',
    detail: 'ENG-2011-003',
    action: 'View stock',
    href: '/warehouse/stock',
  },
];

describe('TaskList', () => {
  it('lists each task with its status in words, a count and a link to do it', () => {
    render(<TaskList {...COMMON} tasks={TASKS} />);
    const list = screen.getByRole('list', { name: 'Needs your action' });
    const [first] = within(list).getAllByRole('listitem');
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(first).toHaveTextContent('Sent');
    expect(within(first ?? list).getByRole('link', { name: 'Review request' })).toHaveAttribute(
      'href',
      '/warehouse/requests/WR-31',
    );
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('says so when nothing is waiting', () => {
    render(<TaskList {...COMMON} tasks={[]} />);
    expect(screen.getByText('Nothing needs you right now')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('announces loading', () => {
    render(<TaskList {...COMMON} tasks={undefined} isLoading />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading tasks…');
  });

  it('shows the failure with a retry', async () => {
    const onRetry = vi.fn();
    render(
      <TaskList
        {...COMMON}
        tasks={undefined}
        error={new Error('Network down')}
        onRetry={onRetry}
      />,
    );
    expect(screen.getByText('Could not load your tasks')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: /try again|retry/i }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
