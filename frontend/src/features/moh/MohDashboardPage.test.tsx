import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { RecordedRequest } from '@/test/fakeAdapter';
import { anEvent, anOrder, envelope } from '@/test/fulfilmentFixtures';
import { renderApp } from '@/test/renderApp';

import type { DistrictStoreSummary, NationalSummary } from './api';
import MohDashboardPage from './MohDashboardPage';

const SUMMARY: NationalSummary = {
  warehouse_stock: [
    { warehouse: 'NMS', stock: { male: 512_000, female: 38_400 } },
    { warehouse: 'JMS', stock: { male: 162_000, female: 12_600 } },
  ],
  orders_by_status: {
    queued: 3,
    on_hold: 4,
    confirmed: 2,
    dispatched: 0,
    in_transit: 2,
    delivered: 1,
    received: 3,
  },
  stockouts_last_7_days: 11,
  average_lead_minutes: 200,
};

const STORES: DistrictStoreSummary[] = [
  {
    district: 'Gulu',
    store: 'Gulu district store',
    stock: { male: 7250, female: 0 },
    min_levels: { male: 4000, female: 200 },
    open_orders: 2,
  },
];

function api(summary: { status: number; body?: unknown }) {
  return (request: RecordedRequest) => {
    switch (request.url) {
      case '/national/summary':
        return summary;
      case '/national/district-stores':
        return { status: 200, body: envelope(STORES) };
      case '/national/hotspot-orders':
        return {
          status: 200,
          body: envelope([
            anOrder({ id: 'ORD-0137', status: 'received', created_at: '2026-11-19T09:00:00Z' }),
            anOrder({ id: 'ORD-0141', status: 'queued', created_at: '2026-11-19T08:00:00Z' }),
          ]),
        };
      case '/national/activity':
        return { status: 200, body: envelope([anEvent()]) };
      default:
        return { status: 404, body: { success: false, message: 'Not found' } };
    }
  };
}

describe('MohDashboardPage', () => {
  it('shows the national figures, the latest open order and every district store', async () => {
    renderApp(<MohDashboardPage />, {
      route: '/moh',
      signedIn: true,
      replies: [api({ status: 200, body: envelope(SUMMARY) })],
    });

    expect(await screen.findByText('725,000')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open hotspot orders/ })).toHaveTextContent('12');
    expect(screen.getByRole('link', { name: /Stockouts in the last 7 days/ })).toHaveTextContent(
      '11',
    );
    expect(screen.getByRole('link', { name: /Average lead time/ })).toHaveTextContent('3 h 20 min');

    expect(
      await screen.findByRole('heading', { name: 'Latest order ORD-0141' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Audit trail' })).toHaveAttribute(
      'href',
      '/moh/orders/ORD-0141',
    );

    const stages = screen
      .getByRole('heading', { name: 'Hotspot orders by stage' })
      .closest('section');
    expect(stages).toHaveTextContent('With rider');

    const gulu = (await screen.findByRole('cell', { name: 'Gulu' })).closest('tr');
    expect(gulu).toHaveTextContent('Female stocked out');

    expect(
      await screen.findByText('Notified a stockout at Kasenyi Landing Site'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Stock, orders and deliveries on this page are illustrative/),
    ).toBeInTheDocument();
  });

  it('explains when the national figures cannot be loaded, and still shows the rest', async () => {
    renderApp(<MohDashboardPage />, {
      route: '/moh',
      signedIn: true,
      // A refusal is not retried, so the error shows at once.
      replies: [api({ status: 403, body: { success: false, message: 'Forbidden' } })],
    });

    expect(await screen.findByText('Could not load the national figures')).toBeInTheDocument();
    expect(await screen.findByRole('cell', { name: 'Gulu' })).toBeInTheDocument();
  });
});
