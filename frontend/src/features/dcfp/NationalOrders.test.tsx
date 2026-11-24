import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { anOrder, aReport, dcfpApi } from '@/test/dcfpFixtures';
import type { RecordedRequest } from '@/test/fakeAdapter';
import { testRouter } from '@/test/navigation';
import { renderApp, sessionWith } from '@/test/renderApp';

import { NATIONAL_PAGE_SIZE } from './national';
import StockoutsPage from './StockoutsPage';
import WarehouseOrdersPage from './WarehouseOrdersPage';

/* MOH's national Orders lists page, filter and search on the server rather than in the browser. */

const MOH = sessionWith(['orders:read', 'orders:all_stores'], ['moh']);
const query = (request: RecordedRequest | undefined) =>
  new URLSearchParams(request?.url.split('?')[1] ?? '');
const lastTo = (requests: RecordedRequest[], path: string) =>
  requests
    .filter((request) => request.method === 'GET' && request.url.split('?')[0] === path)
    .at(-1);

describe('StockoutsPage, national', () => {
  it('asks the server for the open requests, a page at a time', async () => {
    const { requests } = renderApp(<StockoutsPage scope="national" />, {
      route: '/moh/orders',
      session: MOH,
      replies: [dcfpApi({ reports: [aReport()] })],
    });

    expect(await screen.findByRole('link', { name: 'Kisenyi Landing' })).toHaveAttribute(
      'href',
      '/moh/orders/r1',
    );
    const sent = query(lastTo(requests, '/orders/stockouts'));
    expect(sent.get('status')).toBe('awaiting_supply,awaiting_acknowledgement,partly_received');
    expect(sent.get('limit')).toBe(String(NATIONAL_PAGE_SIZE));
    expect(sent.get('q')).toBeNull();
  });

  it('searches every district on the server, and keeps the search in the address', async () => {
    const user = userEvent.setup();
    const { requests } = renderApp(<StockoutsPage scope="national" />, {
      route: '/moh/orders?status=all',
      session: MOH,
      replies: [dcfpApi({ reports: [aReport()] })],
    });

    await screen.findByRole('link', { name: 'Kisenyi Landing' });
    await user.type(screen.getByPlaceholderText('Search hotspots and places…'), 'Kisenyi');
    await waitFor(() => {
      expect(testRouter.location).toBe('/moh/orders?status=all&q=Kisenyi');
    });
    await waitFor(() => {
      expect(query(lastTo(requests, '/orders/stockouts')).get('q')).toBe('Kisenyi');
    });
    expect(query(lastTo(requests, '/orders/stockouts')).get('status')).toBeNull();
  });

  it('reads the next page on request', async () => {
    const user = userEvent.setup();
    const page = Array.from({ length: NATIONAL_PAGE_SIZE }, (_, n) =>
      aReport({ id: `p-${String(n)}` }),
    );
    const { requests } = renderApp(<StockoutsPage scope="national" />, {
      route: '/moh/orders?status=all',
      session: MOH,
      replies: [
        (request: RecordedRequest) =>
          request.url.startsWith('/orders/stockouts')
            ? {
                status: 200,
                body: {
                  success: true,
                  data: query(request).get('offset') ? [aReport({ id: 'last' })] : page,
                },
              }
            : dcfpApi()(request),
      ],
    });

    await user.click(await screen.findByRole('button', { name: 'Load more requests' }));
    await waitFor(() => {
      expect(query(lastTo(requests, '/orders/stockouts')).get('offset')).toBe('50');
    });
  });
});

describe('WarehouseOrdersPage, national', () => {
  it('asks the server for warehouse requests with the status and search in the address', async () => {
    const { requests } = renderApp(<WarehouseOrdersPage scope="national" />, {
      route: '/moh/orders/warehouse?status=dispatched&q=kampala',
      session: MOH,
      replies: [dcfpApi({ orders: [anOrder({ order_status: 'dispatched' })] })],
    });

    await screen.findByRole('table', { name: 'Warehouse orders' });
    await waitFor(() => {
      expect(lastTo(requests, '/orders')).toBeDefined();
    });
    const sent = query(lastTo(requests, '/orders'));
    expect(sent.get('type')).toBe('warehouse_request');
    expect(sent.get('status')).toBe('dispatched');
    expect(sent.get('q')).toBe('kampala');
    expect(sent.get('limit')).toBe(String(NATIONAL_PAGE_SIZE));
    expect(screen.getByPlaceholderText('Search district stores…')).toHaveValue('kampala');
  });

  it('leaves the district’s own list as it was: its own orders, filtered in the browser', async () => {
    const { requests } = renderApp(<WarehouseOrdersPage />, {
      route: '/dcfp/restock',
      signedIn: true,
      replies: [dcfpApi({ orders: [anOrder()] })],
    });

    await screen.findByRole('table', { name: 'Warehouse orders' });
    await waitFor(() => {
      expect(lastTo(requests, '/orders')).toBeDefined();
    });
    const sent = requests.filter((request) => request.url.split('?')[0] === '/orders');
    expect(sent.every((request) => !query(request).has('type') && !query(request).has('q'))).toBe(
      true,
    );
  });
});
