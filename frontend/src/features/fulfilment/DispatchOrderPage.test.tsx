import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { anOrder, fulfilmentApi, RIDERS } from '@/test/fulfilmentFixtures';
import { testRouter } from '@/test/navigation';
import { renderApp } from '@/test/renderApp';

import DispatchOrderPage from './DispatchOrderPage';
import DispatchPage from './DispatchPage';

const confirmed = anOrder({
  status: 'confirmed',
  confirmed_at: '2026-11-20T08:00:00Z',
  allocation: [
    {
      product: 'male',
      batch: 'ENG-2407-088',
      manufactured_on: '2024-07-08',
      expires_on: '2029-06-30',
      quantity: 800,
    },
  ],
});

describe('DispatchOrderPage', () => {
  it('hands a confirmed order to the first available rider', async () => {
    const user = userEvent.setup();
    const { requests } = renderApp(<DispatchOrderPage />, {
      route: '/dcfp/dispatch/ORD-0141',
      signedIn: true,
      replies: [fulfilmentApi({ orders: [confirmed], riders: RIDERS })],
    });

    const musa = await screen.findByRole('radio', { name: /Musa Kato/ });
    expect(musa).toBeChecked();
    // A rider out on a delivery cannot be chosen.
    expect(screen.getByRole('radio', { name: /Peter Okello/ })).toBeDisabled();
    const note = screen.getByRole('table', { name: 'Items on the delivery note' });
    expect(within(note).getByText('ENG-2407-088')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Hand over to Musa' }));

    await waitFor(() => {
      expect(testRouter.location).toBe('/dcfp/dispatch');
    });
    expect(requests.find((request) => request.method === 'POST')).toMatchObject({
      url: '/hotspot-orders/ORD-0141/dispatch',
      body: { rider_id: 'R1' },
    });
  });

  it('says when the order has already gone out, and offers no hand-over', async () => {
    renderApp(<DispatchOrderPage />, {
      route: '/dcfp/dispatch/ORD-0141',
      signedIn: true,
      replies: [
        fulfilmentApi({
          orders: [
            anOrder({
              status: 'dispatched',
              delivery: {
                note_number: 'DN-2026-0091',
                rider: {
                  id: 'R2',
                  name: 'Peter Okello',
                  phone: '+256 782 105 447',
                  plate: 'UEK 019D',
                },
                assigned_at: '2026-11-20T08:30:00Z',
                collected_at: null,
                delivered_at: null,
              },
            }),
          ],
        }),
      ],
    });

    expect(await screen.findByText('Already dispatched')).toBeInTheDocument();
    expect(screen.getByText('ORD-0141 is with Peter Okello on DN-2026-0091.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Hand over/ })).not.toBeInTheDocument();
  });
});

describe('DispatchPage', () => {
  it('lists confirmed orders to prepare and the riders’ status', async () => {
    renderApp(<DispatchPage />, {
      route: '/dcfp/dispatch',
      signedIn: true,
      replies: [fulfilmentApi({ orders: [confirmed], riders: RIDERS })],
    });

    const ready = await screen.findByRole('list', { name: 'Ready to dispatch' });
    expect(within(ready).getByRole('link', { name: 'Prepare dispatch' })).toHaveAttribute(
      'href',
      '/dcfp/dispatch/ORD-0141',
    );
    expect(await screen.findByText('No deliveries in progress.')).toBeInTheDocument();
    const riders = await screen.findByRole('list', { name: 'Riders' });
    expect(within(riders).getByText('On delivery')).toBeInTheDocument();
  });
});
