import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { anOrder, aStore, fulfilmentApi } from '@/test/fulfilmentFixtures';
import { testRouter } from '@/test/navigation';
import { renderApp } from '@/test/renderApp';

import OrderReviewPage from './OrderReviewPage';

const ROUTE = '/dcfp/orders/ORD-0141';

/*
 * The page is rendered on its own at its address (the `useParams` stand-in
 * reads the ID from it), so these tests do not depend on every other route.
 */

// Expiry warnings and FEFO picks depend on today's date; only `Date` is faked.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-20T09:00:00Z') });
});
afterEach(() => {
  vi.useRealTimers();
});

async function checkStock(user: ReturnType<typeof userEvent.setup>) {
  const check = await screen.findByRole('button', { name: 'Check stock availability' });
  await waitFor(() => {
    expect(check).toBeEnabled();
  });
  await user.click(check);
}

describe('OrderReviewPage', () => {
  it('checks stock, suggests batches first-expiry-first-out and confirms the order', async () => {
    const user = userEvent.setup();
    const { requests } = renderApp(<OrderReviewPage />, {
      route: ROUTE,
      signedIn: true,
      replies: [fulfilmentApi({ orders: [anOrder()], store: aStore() })],
    });

    expect(await screen.findByText('Review the quantities, then check stock')).toBeInTheDocument();
    await checkStock(user);

    expect(
      await screen.findByText('All items are available in the district store'),
    ).toBeInTheDocument();
    // The batch expiring first is picked first.
    expect(screen.getByLabelText('Pieces to issue from batch ENG-2206-021')).toHaveValue('400');
    expect(screen.getByLabelText('Pieces to issue from batch ENG-2407-088')).toHaveValue('400');

    await user.click(screen.getByRole('button', { name: 'Confirm order and notify hotspot' }));

    await waitFor(() => {
      expect(requests.find((request) => request.method === 'POST')).toMatchObject({
        url: '/hotspot-orders/ORD-0141/confirm',
        body: {
          approved: { male: 800, female: 40 },
          lines: [
            { product: 'male', batch: 'ENG-2206-021', quantity: 400 },
            { product: 'male', batch: 'ENG-2407-088', quantity: 400 },
            { product: 'female', batch: 'FC2-2405-031', quantity: 40 },
          ],
        },
      });
    });
  });

  it('moves focus to the banner once confirming has replaced the buttons', async () => {
    const user = userEvent.setup();
    let isConfirmed = false;
    const before = fulfilmentApi({ orders: [anOrder()], store: aStore() });
    const after = fulfilmentApi({
      orders: [anOrder({ status: 'confirmed', confirmed_at: '2026-11-20T08:55:00Z' })],
      store: aStore(),
    });
    renderApp(<OrderReviewPage />, {
      route: ROUTE,
      signedIn: true,
      replies: [
        (request: { method: string; url: string }) => {
          if (request.method === 'POST') isConfirmed = true;
          return (isConfirmed ? after : before)(request);
        },
      ],
    });

    await checkStock(user);
    await user.click(
      await screen.findByRole('button', { name: 'Confirm order and notify hotspot' }),
    );

    await waitFor(() => {
      expect(screen.getByText(/^Confirmed /).closest('[data-slot="alert"]')).toHaveFocus();
    });
    expect(screen.getByRole('link', { name: 'Prepare dispatch' })).toBeInTheDocument();
  });

  it('will not approve more than was requested', async () => {
    const user = userEvent.setup();
    renderApp(<OrderReviewPage />, {
      route: ROUTE,
      signedIn: true,
      replies: [fulfilmentApi({ orders: [anOrder()], store: aStore() })],
    });

    const male = await screen.findByLabelText('Approved quantity, male condoms');
    await user.clear(male);
    await user.type(male, '900');

    // Announced politely as it appears, so the disabled check is not left unexplained.
    expect(screen.getByText('No more than the 800 requested.')).toHaveAttribute(
      'aria-live',
      'polite',
    );
    expect(male).toHaveAccessibleDescription('No more than the 800 requested.');
    expect(screen.getByRole('button', { name: 'Check stock availability' })).toBeDisabled();
  });

  it('announces a pick over what a batch holds without interrupting', async () => {
    const user = userEvent.setup();
    renderApp(<OrderReviewPage />, {
      route: ROUTE,
      signedIn: true,
      replies: [fulfilmentApi({ orders: [anOrder()], store: aStore() })],
    });

    await checkStock(user);
    const pick = await screen.findByLabelText('Pieces to issue from batch ENG-2206-021');
    await user.clear(pick);
    await user.type(pick, '999999');

    expect(pick).toBeInvalid();
    expect(pick).toHaveAccessibleDescription('More than available');
    expect(screen.getByText('More than available')).toHaveAttribute('aria-live', 'polite');
  });

  it('holds a short order and goes on to request stock for it', async () => {
    const user = userEvent.setup();
    const { requests } = renderApp(<OrderReviewPage />, {
      route: ROUTE,
      signedIn: true,
      replies: [
        fulfilmentApi({ orders: [anOrder()], store: aStore({ stock: { male: 300, female: 60 } }) }),
      ],
    });

    await checkStock(user);
    expect(await screen.findByText('Not enough stock in the district store')).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Put on hold and request from warehouse' }),
    );

    await waitFor(() => {
      expect(testRouter.location).toBe('/dcfp/restock/new?order=ORD-0141');
    });
    expect(requests.find((request) => request.method === 'POST')).toMatchObject({
      url: '/hotspot-orders/ORD-0141/hold',
      body: {
        reason: 'Not enough stock in the district store',
        approved: { male: 800, female: 40 },
      },
    });
  });

  it('shows the server’s reason when confirming fails, keeping the review', async () => {
    const user = userEvent.setup();
    renderApp(<OrderReviewPage />, {
      route: ROUTE,
      signedIn: true,
      replies: [
        fulfilmentApi(
          { orders: [anOrder()], store: aStore() },
          {
            'POST /hotspot-orders/ORD-0141/confirm': {
              status: 409,
              body: { success: false, message: 'ORD-0141 is no longer waiting for review.' },
            },
          },
        ),
      ],
    });

    await checkStock(user);
    await user.click(
      await screen.findByRole('button', { name: 'Confirm order and notify hotspot' }),
    );

    expect(
      await screen.findByText('ORD-0141 is no longer waiting for review.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Approved quantity, male condoms')).toHaveValue('800');
  });

  it('says so when the order does not exist', async () => {
    renderApp(<OrderReviewPage />, {
      route: '/dcfp/orders/ORD-9999',
      signedIn: true,
      replies: [fulfilmentApi({ orders: [] })],
    });

    expect(await screen.findByText("That order isn't available")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to the order queue' })).toHaveAttribute(
      'href',
      '/dcfp/orders',
    );
  });

  it('links a confirmed order to its dispatch page', async () => {
    renderApp(<OrderReviewPage />, {
      route: ROUTE,
      signedIn: true,
      replies: [
        fulfilmentApi({
          orders: [anOrder({ status: 'confirmed', confirmed_at: '2026-11-20T08:00:00Z' })],
        }),
      ],
    });

    expect(await screen.findByRole('link', { name: 'Prepare dispatch' })).toHaveAttribute(
      'href',
      '/dcfp/dispatch/ORD-0141',
    );
  });
});
