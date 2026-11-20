import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { testRouter } from '@/test/navigation';

import { FilterTabs } from './FilterTabs';

const tabs = [
  { value: 'all', label: 'All', count: 12 },
  { value: 'queued', label: 'In queue', count: 3 },
  { value: 'held', label: 'On hold' },
] as const;

const hrefFor = (value: string) => (value === 'all' ? '/orders' : `/orders?status=${value}`);

describe('FilterTabs', () => {
  it('links each filter to its address and marks the active one', () => {
    render(<FilterTabs label="Filter orders" tabs={tabs} value="queued" hrefFor={hrefFor} />);

    const nav = screen.getByRole('navigation', { name: 'Filter orders' });
    const queued = within(nav).getByRole('link', { name: 'In queue 3' });
    expect(queued).toHaveAttribute('href', '/orders?status=queued');
    expect(queued).toHaveAttribute('aria-current', 'true');
    expect(within(nav).getByRole('link', { name: 'All 12' })).not.toHaveAttribute('aria-current');
  });

  it('leaves out a count that is not known yet', () => {
    render(<FilterTabs label="Filter orders" tabs={tabs} value="all" hrefFor={hrefFor} />);
    expect(screen.getByRole('link', { name: 'On hold' })).toBeInTheDocument();
  });

  it('is reached and followed by keyboard', async () => {
    const user = userEvent.setup();
    testRouter.reset('/orders');
    render(<FilterTabs label="Filter orders" tabs={tabs} value="all" hrefFor={hrefFor} />);

    await user.tab();
    await user.tab();
    expect(screen.getByRole('link', { name: 'In queue 3' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(testRouter.location).toBe('/orders?status=queued');
  });
});
