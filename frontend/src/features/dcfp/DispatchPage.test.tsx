import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { ReadOnlyProvider } from '@/navigation/useAccess';
import { aReport, FEMALE } from '@/test/dcfpFixtures';
import type { RecordedRequest } from '@/test/fakeAdapter';
import { testRouter } from '@/test/navigation';
import { renderApp, sessionWith } from '@/test/renderApp';
import { aProductSummary, aStoreSummary, warehouseOrderApi } from '@/test/warehouseOrderFixtures';

import type { StockoutDetail } from './api';
import DispatchPage from './DispatchPage';
import StockoutsPage from './StockoutsPage';

const storeId = 'store-wakiso';
const report = aReport({ district_store_id: storeId, status: 'awaiting_supply' });
const route = '/dcfp/stockouts/dispatch';
const selectedRoute = `${route}?report=${report.id}`;
function session(
  permissions = ['orders:read', 'orders:supply_hotspots', 'orders:replenish', 'inventory:read'],
) {
  const result = sessionWith(permissions, ['dcfp']);
  result.user.store_id = storeId;
  return result;
}
const supply = aStoreSummary({
  store_id: storeId,
  store_type: 'district',
  products: [aProductSummary({ usable: 5 })],
});
const inventory = warehouseOrderApi({ summary: supply, products: [FEMALE] });
const delivery: StockoutDetail['deliveries'][number] = {
  id: 'delivery-1',
  note: 'For the dispenser',
  created_at: '2026-11-23T07:00:00Z',
  lines: [
    {
      id: 'line-1',
      product: 'Engabu · Female · Free',
      category: 'female',
      quantity: 2,
      pieces: 200,
      acknowledged_pieces: null,
      acknowledged_at: null,
    },
  ],
};
function api(request: RecordedRequest) {
  if (request.url.startsWith('/orders/stockouts?'))
    return { status: 200, body: { success: true, data: [report] } };
  if (request.url === `/orders/stockouts/${report.id}`)
    return { status: 200, body: { success: true, data: { ...report, deliveries: [] } } };
  return inventory(request);
}

describe('Hotspot dispatch workspace', () => {
  it('opens the dispatch tab with the stockout row selected', async () => {
    const user = userEvent.setup();
    renderApp(<StockoutsPage />, { route: '/dcfp/stockouts', session: session(), replies: [api] });
    await user.click(await screen.findByRole('button', { name: 'Actions for Kisenyi Landing' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Dispatch to hotspot' }));
    expect(testRouter.location).toBe(selectedRoute);
  });

  it('selects a hotspot, preselects its report, posts quantities and refreshes stock and history', async () => {
    const user = userEvent.setup();
    let sent = false;
    const { requests } = renderApp(<DispatchPage />, {
      route,
      session: session(),
      replies: [
        (request) => {
          if (request.method === 'POST') {
            sent = true;
            return {
              status: 201,
              body: { success: true, data: { ...report, status: 'awaiting_acknowledgement' } },
            };
          }
          if (sent && request.url === `/orders/stockouts/${report.id}`)
            return {
              status: 200,
              body: {
                success: true,
                data: { ...report, status: 'awaiting_acknowledgement', deliveries: [delivery] },
              },
            };
          if (sent && request.url.startsWith('/inventory/store-summary'))
            return {
              status: 200,
              body: {
                success: true,
                data: { ...supply, products: [aProductSummary({ usable: 3 })] },
              },
            };
          return api(request);
        },
      ],
    });
    await user.click(await screen.findByRole('link', { name: 'Select Kisenyi Landing' }));
    expect(await screen.findByText('5 box')).toBeInTheDocument();
    expect(screen.getByText('Peter Okello · 0700123456')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Dispatch to Kisenyi Landing' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('combobox', { name: /Hotspot stockout/ })).toBeDisabled();
    await user.type(await within(dialog).findByRole('spinbutton', { name: /Female/ }), '2');
    await user.click(within(dialog).getByRole('button', { name: 'Record dispatch' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByText('200 pieces sent')).toBeInTheDocument();
    expect(await screen.findByText('3 box')).toBeInTheDocument();
    const writes = requests.filter((r) => r.method === 'POST');
    expect(writes).toHaveLength(1);
    expect(writes[0]?.url).toBe(`/orders/stockouts/${report.id}/deliveries`);
    expect(writes[0]?.body).toHaveProperty('client_reference');
    expect(writes[0]?.body).toMatchObject({
      lines: [{ condom_id: FEMALE.id, unit_of_measure_id: 'u-box', quantity: 2 }],
    });
  });

  it('filters fulfilled reports, shows confirmed quantities and excludes another district', async () => {
    const user = userEvent.setup();
    const fulfilled = { ...report, status: 'fulfilled' as const };
    renderApp(<DispatchPage />, {
      route,
      session: session(),
      replies: [
        (request) => {
          if (request.url.startsWith('/orders/stockouts?'))
            return {
              status: 200,
              body: {
                success: true,
                data: [
                  fulfilled,
                  aReport({
                    id: 'other',
                    district_store_id: 'other-store',
                    hot_spot: { ...report.hot_spot, name: 'Outside district' },
                  }),
                ],
              },
            };
          if (request.url === `/orders/stockouts/${report.id}`)
            return {
              status: 200,
              body: {
                success: true,
                data: {
                  ...fulfilled,
                  deliveries: [
                    {
                      ...delivery,
                      lines: [
                        {
                          ...delivery.lines[0],
                          acknowledged_pieces: 190,
                          acknowledged_at: '2026-11-23T08:00:00Z',
                        },
                      ],
                    },
                  ],
                },
              },
            };
          return inventory(request);
        },
      ],
    });
    expect(await screen.findByText('No hotspot requests here')).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Fulfilled' }));
    await user.click(await screen.findByRole('link', { name: 'Select Kisenyi Landing' }));
    expect(await screen.findByText('190 pieces received')).toBeInTheDocument();
    expect(screen.queryByText('Outside district')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Dispatch to Kisenyi Landing' }),
    ).not.toBeInTheDocument();
  });

  it.each(['history', 'stock'])(
    'keeps a %s failure visible and prevents dispatch',
    async (failure) => {
      renderApp(<DispatchPage />, {
        route: selectedRoute,
        session: session(),
        replies: [
          (request) => {
            if (
              (failure === 'history' && request.url === `/orders/stockouts/${report.id}`) ||
              (failure === 'stock' && request.url.startsWith('/inventory/store-summary'))
            )
              return { status: 500, body: { success: false, message: 'Temporarily unavailable' } };
            return api(request);
          },
        ],
      });
      expect(
        await screen.findByText(
          failure === 'history'
            ? 'Could not load dispatch history'
            : 'Could not load district stock',
        ),
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Dispatch to Kisenyi Landing' })).toBeDisabled();
    },
  );

  it('allows reading history without mutation permission and in read-only mode', async () => {
    const view = renderApp(<DispatchPage />, {
      route: selectedRoute,
      session: session(['orders:read', 'inventory:read']),
      replies: [api],
    });
    expect(await screen.findByText('No dispatches yet')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Dispatch to Kisenyi Landing' }),
    ).not.toBeInTheDocument();
    view.unmount();
    renderApp(
      <ReadOnlyProvider value={true}>
        <DispatchPage />
      </ReadOnlyProvider>,
      { route: selectedRoute, session: session(), replies: [api] },
    );
    expect(await screen.findByText('No dispatches yet')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Dispatch to Kisenyi Landing' }),
    ).not.toBeInTheDocument();
  });

  it('does not fetch data without a district store assignment', () => {
    const { requests } = renderApp(<DispatchPage />, {
      route,
      session: sessionWith(['orders:read'], ['dcfp']),
    });
    expect(screen.getByText('No district store assigned')).toBeInTheDocument();
    expect(requests).toHaveLength(0);
  });
});
