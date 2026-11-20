import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { anOrder, fulfilmentApi } from '@/test/fulfilmentFixtures';
import { testRouter } from '@/test/navigation';
import { renderApp } from '@/test/renderApp';

import OrderQueuePage from './OrderQueuePage';

const orders = [
  anOrder({ id: 'ORD-0141', status: 'queued' }),
  anOrder({ id: 'ORD-0142', status: 'on_hold' }),
  anOrder({ id: 'ORD-0143', status: 'confirmed', confirmed_at: '2026-11-19T10:00:00Z' }),
];

describe('OrderQueuePage', () => {
  it('filters by status, keeping the filter in the address', async () => {
    const user = userEvent.setup();
    renderApp(<OrderQueuePage />, {
      route: '/dcfp/orders',
      signedIn: true,
      replies: [fulfilmentApi({ orders })],
    });
    const table = await screen.findByRole('table', { name: 'Orders' });
    expect(await within(table).findByText('ORD-0141')).toBeInTheDocument();
    expect(within(table).getByText('ORD-0142')).toBeInTheDocument();

    const filters = screen.getByRole('navigation', { name: 'Filter orders by status' });
    await user.click(within(filters).getByRole('link', { name: /On hold/ }));

    expect(testRouter.location).toBe('/dcfp/orders?status=on_hold');
    expect(within(filters).getByRole('link', { name: /On hold/ })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(within(table).getByText('ORD-0142')).toBeInTheDocument();
    expect(within(table).queryByText('ORD-0141')).not.toBeInTheDocument();
  });

  it('opens on the filter named in the address, and sends confirmed orders to dispatch', async () => {
    renderApp(<OrderQueuePage />, {
      route: '/dcfp/orders?status=confirmed',
      signedIn: true,
      replies: [fulfilmentApi({ orders })],
    });

    const table = await screen.findByRole('table', { name: 'Orders' });
    expect(await within(table).findByRole('link', { name: 'ORD-0143' })).toHaveAttribute(
      'href',
      '/dcfp/dispatch/ORD-0143',
    );
    expect(within(table).queryByText('ORD-0141')).not.toBeInTheDocument();
  });
});
