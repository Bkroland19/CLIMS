import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { anEvent, anOrder, aRequest, DISPATCH_DETAILS, envelope } from '@/test/fulfilmentFixtures';
import { renderApp } from '@/test/renderApp';

import type { OrderDetail } from './api';
import MohOrderAuditPage from './MohOrderAuditPage';

const DETAIL: OrderDetail = {
  order: anOrder({
    id: 'ORD-MBR-0093',
    status: 'on_hold',
    hotspot: { ...anOrder().hotspot, name: 'Mbarara Taxi Park', district: 'Mbarara' },
    requested_by: { name: 'Mugisha Peter', role: 'Hotspot manager' },
    hold_reason: 'District stock not available',
    warehouse_request_id: 'WR-MBR-2026-0008',
  }),
  warehouse_request: aRequest({
    id: 'WR-MBR-2026-0008',
    district: 'Mbarara',
    status: 'received',
    dispatch: DISPATCH_DETAILS,
    receipt: {
      received_at: '2026-11-19T06:00:00Z',
      received_by: 'Kansiime Doreen',
      grn: 'GRN-MBR-2026-006',
      accepted: { male: 5880, female: 300 },
      store_after: { male: 11_600, female: 540 },
      lines: [],
      discrepancy: { type: 'Damaged', note: 'One carton crushed in transit.' },
    },
  }),
  held_at: '2026-11-19T07:40:00Z',
  // Sent newest first on purpose: the page shows the trail oldest first.
  trail: [
    anEvent({
      id: 'e3',
      at: '2026-11-19T10:00:00Z',
      actor: 'Sarah Kemigisa',
      role: 'warehouse',
      role_label: 'NMS',
      text: 'Dispatched on waybill WB-NMS-26-1187',
      reference: 'WR-MBR-2026-0008',
    }),
    anEvent({
      id: 'e2',
      at: '2026-11-19T07:40:00Z',
      actor: 'Kansiime Doreen',
      role: 'dcfp',
      role_label: 'DCFP',
      text: 'Put on hold — district stock not available',
      reference: 'ORD-MBR-0093',
    }),
    anEvent({
      id: 'e1',
      at: '2026-11-19T07:35:00Z',
      actor: 'Mugisha Peter',
      text: 'Notified a stockout at Mbarara Taxi Park',
      reference: 'ORD-MBR-0093',
    }),
  ],
};

describe('MohOrderAuditPage', () => {
  it('shows who did what, in which role and when, oldest first', async () => {
    const { requests } = renderApp(<MohOrderAuditPage />, {
      route: '/moh/orders/ORD-MBR-0093',
      signedIn: true,
      replies: [{ status: 200, body: envelope(DETAIL) }],
    });

    expect(await screen.findByRole('heading', { name: 'ORD-MBR-0093' })).toBeInTheDocument();
    expect(requests[0]?.url).toBe('/national/hotspot-orders/ORD-MBR-0093');
    expect(screen.getByText(/Mbarara Taxi Park · Mbarara district/)).toBeInTheDocument();

    const trail = screen.getByRole('list', { name: 'Audit trail for ORD-MBR-0093' });
    const items = within(trail).getAllByRole('listitem');
    expect(items.map((item) => item.dataset.role)).toEqual([
      'hotspot-manager',
      'dcfp',
      'warehouse',
    ]);
    expect(items[0]).toHaveTextContent('Notified a stockout at Mbarara Taxi Park');
    expect(items[0]).toHaveTextContent('Mugisha Peter · Hotspot manager');
    expect(items[1]).toHaveTextContent('Kansiime Doreen · DCFP');
    expect(items[1]).toHaveTextContent('5 min after the last step');
    expect(items[2]).toHaveTextContent('WR-MBR-2026-0008 · Sarah Kemigisa · NMS');
    expect(items[2]).toHaveTextContent('2 h 20 min after the last step');
  });

  it('shows the headline figures, the warehouse request and its exceptions', async () => {
    renderApp(<MohOrderAuditPage />, {
      route: '/moh/orders/ORD-MBR-0093',
      signedIn: true,
      replies: [{ status: 200, body: envelope(DETAIL) }],
    });

    await screen.findByRole('heading', { name: 'ORD-MBR-0093' });
    expect(screen.getByText('Requested').nextSibling).toHaveTextContent('Male 800 · Female 40');
    expect(screen.getByText('Lead time').nextSibling).toHaveTextContent(/so far$/);
    expect(screen.getByText('GRN-MBR-2026-006')).toBeInTheDocument();
    expect(screen.getByText('WR-MBR-2026-0008 · Damaged')).toBeInTheDocument();
    expect(screen.getByText('One carton crushed in transit.')).toBeInTheDocument();
    expect(screen.getByText('Not handed to a rider yet.')).toBeInTheDocument();
  });

  it('says plainly when the order does not exist, with a way back', async () => {
    renderApp(<MohOrderAuditPage />, {
      route: '/moh/orders/ORD-NOPE',
      signedIn: true,
      replies: [
        { status: 404, body: { success: false, message: 'Order ORD-NOPE was not found.' } },
      ],
    });

    expect(await screen.findByText("That order isn't available")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to hotspot orders' })).toHaveAttribute(
      'href',
      '/moh/orders',
    );
  });

  it('offers a retry when the order cannot be loaded', async () => {
    renderApp(<MohOrderAuditPage />, {
      route: '/moh/orders/ORD-MBR-0093',
      signedIn: true,
      replies: [{ failure: 'network' }],
    });

    expect(await screen.findByText('Could not load this order')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });
});
