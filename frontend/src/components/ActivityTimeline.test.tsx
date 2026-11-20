import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ActivityTimeline, type ActivityEntry } from './ActivityTimeline';

const ENTRIES: ActivityEntry[] = [
  {
    id: 'e1',
    text: 'Order ORD-104 placed',
    meta: 'Grace A. · Hotspot manager · Today, 08:40',
    role: 'hotspot-manager',
  },
  {
    id: 'e2',
    text: 'Order ORD-104 confirmed',
    meta: 'Sarah N. · DCFP · Today, 09:12',
    role: 'dcfp',
  },
];

describe('ActivityTimeline', () => {
  it('lists the entries in the order given, with who and when', () => {
    render(<ActivityTimeline aria-label="Order history" entries={ENTRIES} />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Order ORD-104 placed');
    expect(items[0]).toHaveTextContent('Hotspot manager');
    expect(items[1]).toHaveTextContent('Sarah N. · DCFP · Today, 09:12');
  });

  it('keeps the role dot out of the accessible text', () => {
    render(<ActivityTimeline aria-label="Order history" entries={ENTRIES} />);
    const item = screen.getAllByRole('listitem')[1];
    expect(item).toHaveAttribute('data-role', 'dcfp');
    expect(item?.querySelector('.bg-role-dcfp')?.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it.each(['connected', 'compact'] as const)('renders the %s variant', (variant) => {
    render(<ActivityTimeline aria-label="Activity" entries={ENTRIES} variant={variant} />);
    expect(screen.getByRole('list', { name: 'Activity' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });
});
