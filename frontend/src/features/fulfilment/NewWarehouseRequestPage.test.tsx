import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { anOrder, aRequest, aStore, envelope, fulfilmentApi } from '@/test/fulfilmentFixtures';
import { testRouter } from '@/test/navigation';
import { renderApp } from '@/test/renderApp';

import NewWarehouseRequestPage from './NewWarehouseRequestPage';

const orders = [
  anOrder({ id: 'ORD-0151', status: 'on_hold', approved: { male: 500, female: 0 } }),
  anOrder({ id: 'ORD-0150', status: 'on_hold', approved: { male: 2000, female: 100 } }),
  // Already waiting on a request: not offered again.
  anOrder({ id: 'ORD-0149', status: 'on_hold', warehouse_request_id: 'WR-2026-0031' }),
];
// 1,400 male and 60 female in store; minimums 5,000 and 300.
const store = aStore();

describe('NewWarehouseRequestPage', () => {
  it('pre-fills whole cartons for the held orders and sends the request', async () => {
    const user = userEvent.setup();
    const { requests } = renderApp(<NewWarehouseRequestPage />, {
      route: '/dcfp/restock/new?order=ORD-0150',
      signedIn: true,
      replies: [
        fulfilmentApi(
          { orders, store },
          {
            'POST /warehouse-requests': {
              status: 200,
              body: envelope(aRequest({ id: 'WR-2026-0040', warehouse: 'JMS' })),
            },
          },
        ),
      ],
    });

    // 2,500 held + 5,000 minimum − 1,400 in store = 6,100 → 7,000; 100 + 300 − 60 = 340 → 400.
    const male = await screen.findByLabelText('Quantity to request, male condoms');
    expect(male).toHaveValue('7000');
    expect(screen.getByLabelText('Quantity to request, female condoms')).toHaveValue('400');
    expect(screen.queryByText(/ORD-0149/)).not.toBeInTheDocument();
    // The order the DCFP came from is listed first, and every held order starts linked.
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes[0]).toHaveAccessibleName(/ORD-0150/);
    for (const box of boxes) expect(box).toBeChecked();

    // Unlinking ORD-0151 lowers the suggestion: 2,000 + 5,000 − 1,400 = 5,600 → 6,000.
    await user.click(screen.getByRole('checkbox', { name: /ORD-0151/ }));
    expect(male).toHaveValue('6000');

    await user.click(screen.getByRole('radio', { name: /JMS/ }));
    await user.click(screen.getByRole('button', { name: 'Send request to JMS' }));

    await waitFor(() => {
      expect(testRouter.location).toBe('/dcfp/restock/WR-2026-0040');
    });
    expect(requests.find((request) => request.method === 'POST')).toMatchObject({
      url: '/warehouse-requests',
      body: {
        warehouse: 'JMS',
        items: { male: 6000, female: 400 },
        linked_orders: ['ORD-0150'],
        note: '',
      },
    });
  });

  it('checks the quantities before sending, and keeps them when the server refuses', async () => {
    const user = userEvent.setup();
    const { requests } = renderApp(<NewWarehouseRequestPage />, {
      route: '/dcfp/restock/new',
      signedIn: true,
      replies: [
        fulfilmentApi(
          { orders, store },
          {
            'POST /warehouse-requests': {
              status: 409,
              body: { success: false, message: 'ORD-0150 is already waiting on WR-2026-0039.' },
            },
          },
        ),
      ],
    });

    const male = await screen.findByLabelText('Quantity to request, male condoms');
    const female = screen.getByLabelText('Quantity to request, female condoms');
    await user.clear(male);
    await user.type(male, '12.5');
    expect(male).toHaveAccessibleDescription('Enter a whole number of pieces.');
    expect(screen.getByText('Enter a whole number of pieces.')).toHaveAttribute(
      'aria-live',
      'polite',
    );

    await user.clear(male);
    await user.type(male, '0');
    await user.clear(female);
    await user.type(female, '0');
    await user.click(screen.getByRole('button', { name: 'Send request to NMS' }));
    expect(await screen.findByText('Request at least one piece.')).toBeInTheDocument();
    expect(requests.some((request) => request.method === 'POST')).toBe(false);

    await user.clear(male);
    await user.type(male, '3,000');
    await user.click(screen.getByRole('button', { name: 'Send request to NMS' }));

    expect(
      await screen.findByText('ORD-0150 is already waiting on WR-2026-0039.'),
    ).toBeInTheDocument();
    expect(requests.find((request) => request.method === 'POST')).toMatchObject({
      body: { items: { male: 3000, female: 0 } },
    });
    expect(male).toHaveValue('3,000');
    expect(testRouter.location).toBe('/dcfp/restock/new');
  });
});
