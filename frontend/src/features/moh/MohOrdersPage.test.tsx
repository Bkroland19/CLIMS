import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { RecordedRequest } from '@/test/fakeAdapter';
import { anOrder, aRequest, envelope } from '@/test/fulfilmentFixtures';
import { testRouter } from '@/test/navigation';
import { renderApp } from '@/test/renderApp';

import type { DistrictStoreSummary } from './api';
import MohOrdersPage from './MohOrdersPage';
import MohRequestsPage from './MohRequestsPage';

const gulu = (overrides: Parameters<typeof anOrder>[0]) =>
  anOrder({
    ...overrides,
    hotspot: { ...anOrder().hotspot, name: 'Gulu Main Market', district: 'Gulu' },
  });

const ORDERS = [
  gulu({ id: 'ORD-GUL-0207', status: 'on_hold' }),
  gulu({ id: 'ORD-GUL-0204', status: 'queued' }),
  anOrder({ id: 'ORD-0141', status: 'on_hold' }),
];

const store = (district: string): DistrictStoreSummary => ({
  district,
  store: `${district} district store`,
  stock: { male: 5000, female: 300 },
  min_levels: { male: 5000, female: 300 },
  open_orders: 1,
});
const STORES = [store('Wakiso'), store('Gulu'), store('Mukono')];

/** Answers like the national API, narrowing lists to the `district` in the query. */
function nationalApi(request: RecordedRequest) {
  const url = new URL(request.url, 'http://test');
  const district = url.searchParams.get('district');
  if (url.pathname === '/national/district-stores') {
    return { status: 200, body: envelope(STORES) };
  }
  if (url.pathname === '/national/hotspot-orders') {
    return {
      status: 200,
      body: envelope(ORDERS.filter((order) => !district || order.hotspot.district === district)),
    };
  }
  if (url.pathname === '/national/warehouse-requests') {
    const requests = [
      aRequest({ id: 'WR-GUL-2026-0019', district: 'Gulu', status: 'dispatched' }),
      aRequest({ id: 'WR-GUL-2026-0017', district: 'Gulu', status: 'received' }),
      aRequest({ id: 'WR-2026-0032', status: 'sent' }),
    ];
    return {
      status: 200,
      body: envelope(requests.filter((entry) => !district || entry.district === district)),
    };
  }
  return { status: 404, body: { success: false, message: 'Not found' } };
}

const rowIds = () =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell')[0]?.textContent ?? '');

describe('MohOrdersPage', () => {
  it('reads the status and district filters from the address', async () => {
    const { requests } = renderApp(<MohOrdersPage />, {
      route: '/moh/orders?status=on_hold&district=Gulu',
      signedIn: true,
      replies: [nationalApi],
    });

    await screen.findByRole('link', { name: 'ORD-GUL-0207' });
    expect(rowIds()).toEqual([expect.stringContaining('ORD-GUL-0207')]);
    expect(requests.map((request) => request.url)).toContain(
      '/national/hotspot-orders?district=Gulu',
    );
    const tabs = screen.getByRole('navigation', { name: 'Filter orders by status' });
    expect(within(tabs).getByRole('link', { name: /On hold/ })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(screen.getByRole('combobox', { name: 'District' })).toHaveTextContent('Gulu');
    expect(screen.getByText(/are illustrative/)).toBeInTheDocument();
  });

  it('keeps the district when the status filter changes, and the status when the district does', async () => {
    const user = userEvent.setup();
    const { requests } = renderApp(<MohOrdersPage />, {
      route: '/moh/orders?status=on_hold&district=Gulu',
      signedIn: true,
      replies: [nationalApi],
    });
    await screen.findByRole('link', { name: 'ORD-GUL-0207' });

    const tabs = screen.getByRole('navigation', { name: 'Filter orders by status' });
    await user.click(within(tabs).getByRole('link', { name: /In queue/ }));
    expect(testRouter.location).toBe('/moh/orders?status=queued&district=Gulu');
    expect(await screen.findByRole('link', { name: 'ORD-GUL-0204' })).toBeInTheDocument();

    await user.click(screen.getByRole('combobox', { name: 'District' }));
    await user.click(await screen.findByRole('option', { name: 'All districts' }));
    expect(testRouter.location).toBe('/moh/orders?status=queued');
    await waitFor(() => {
      expect(requests.map((request) => request.url)).toContain('/national/hotspot-orders');
    });
  });

  it('opens an order’s audit trail from its row', async () => {
    const user = userEvent.setup();
    renderApp(<MohOrdersPage />, { route: '/moh/orders', signedIn: true, replies: [nationalApi] });

    await user.click(await screen.findByRole('button', { name: 'Actions for ORD-0141' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Open audit trail' }));

    expect(testRouter.location).toBe('/moh/orders/ORD-0141');
  });

  it('says when a filter leaves nothing to show', async () => {
    renderApp(<MohOrdersPage />, {
      route: '/moh/orders?status=closed',
      signedIn: true,
      replies: [nationalApi],
    });

    expect(await screen.findByText('No orders in this view')).toBeInTheDocument();
  });

  it('explains a failure and offers a retry', async () => {
    renderApp(<MohOrdersPage />, {
      route: '/moh/orders',
      signedIn: true,
      // A refusal is not retried, so the error shows at once.
      replies: [{ status: 403, body: { success: false, message: 'Forbidden' } }],
    });

    expect(await screen.findByRole('button', { name: /try again/i })).toBeInTheDocument();
  });
});

describe('MohRequestsPage', () => {
  it('filters warehouse requests by status and district from the address', async () => {
    const { requests } = renderApp(<MohRequestsPage />, {
      route: '/moh/orders/warehouse?status=in_transit&district=Gulu',
      signedIn: true,
      replies: [nationalApi],
    });

    expect(await screen.findByText('WR-GUL-2026-0019')).toBeInTheDocument();
    expect(screen.queryByText('WR-GUL-2026-0017')).not.toBeInTheDocument();
    expect(requests.map((request) => request.url)).toContain(
      '/national/warehouse-requests?district=Gulu',
    );
    expect(screen.getByText('NMS → Gulu')).toBeInTheDocument();
  });

  it('leads from a request to the hotspot orders of its district', async () => {
    const user = userEvent.setup();
    renderApp(<MohRequestsPage />, {
      route: '/moh/orders/warehouse',
      signedIn: true,
      replies: [nationalApi],
    });

    await user.click(await screen.findByRole('button', { name: 'Actions for WR-GUL-2026-0019' }));
    await user.click(await screen.findByRole('menuitem', { name: 'View Gulu hotspot orders' }));

    expect(testRouter.location).toBe('/moh/orders?district=Gulu');
  });
});
