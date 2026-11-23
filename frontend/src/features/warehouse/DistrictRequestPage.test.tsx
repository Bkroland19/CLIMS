import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Order } from '@/features/orders/api';
import { AppUnderTest } from '@/test/AppUnderTest';
import { FEMALE } from '@/test/dcfpFixtures';
import type { RecordedRequest } from '@/test/fakeAdapter';
import { renderApp } from '@/test/renderApp';
import {
  aBalance,
  aStockBatch,
  aWarehouseOrder,
  FEMALE_FC2,
  warehouseOrderApi,
} from '@/test/warehouseOrderFixtures';

const ROUTE = '/warehouse/requests/o1?store=NMS';
const action = (name: string) => `/orders/o1/actions/${name}`;

/** Gulu's order of 500 boxes of female condoms, sent to NMS. */
const gulu = (overrides: Partial<Order> = {}) =>
  aWarehouseOrder({ ordered_for_store_id: 'store-gulu', quantity_needed: 500, ...overrides });

/** NMS holds 800 boxes of Engabu and 200 of FC2. */
const BALANCES = [
  aBalance({ condom_id: FEMALE.id, on_hand: 800 }),
  aBalance({ condom_id: FEMALE_FC2.id, product: 'FC2 Free Female', on_hand: 200 }),
];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-20T09:00:00Z') });
});
afterEach(() => {
  vi.useRealTimers();
});

function render(
  order: Order,
  data: Omit<Parameters<typeof warehouseOrderApi>[0], 'orders'> = {},
  writes: Parameters<typeof warehouseOrderApi>[1] = {},
) {
  return renderApp(<AppUnderTest />, {
    route: ROUTE,
    signedIn: true,
    replies: [warehouseOrderApi({ orders: [order], balances: BALANCES, ...data }, writes)],
  });
}

const posts = (requests: RecordedRequest[]) =>
  requests
    .filter((request) => request.method === 'POST')
    .map((request) => ({ url: request.url, body: request.body }));

describe('Deciding on an order', () => {
  it('approves the product that covers the order, then reserves it', async () => {
    const user = userEvent.setup();
    const { requests } = render(gulu());

    expect(await screen.findByText('Waiting for your decision')).toBeInTheDocument();
    const products = await screen.findByRole('group', { name: 'Product to send' });
    const engabu = await within(products).findByRole('radio', {
      name: 'Engabu · Female · Free, box of 100',
    });
    expect(engabu).toBeChecked();
    expect(engabu).toHaveAccessibleDescription(/800 box can be reserved.*Covers the order/);
    expect(
      within(products).getByRole('radio', { name: 'FC2 · Female · Free, box of 100' }),
    ).toHaveAccessibleDescription(/200 box can be reserved.*Part of the order/);
    expect(screen.getByLabelText('Quantity to approve')).toHaveValue('500');

    await user.click(screen.getByRole('button', { name: 'Approve 500 box' }));
    await waitFor(() => {
      expect(posts(requests)).toEqual([
        { url: action('review'), body: { condom_id: FEMALE.id } },
        { url: action('check-stock'), body: {} },
      ]);
    });
  });

  it('counts the order in the unit of the product it chooses', async () => {
    // The district named no unit. NMS holds FC2 in cartons, but FC2's catalogue unit is the box,
    // which the order would take, so none of that stock can be reserved for it.
    render(gulu(), {
      balances: [
        aBalance({ condom_id: FEMALE.id, on_hand: 800 }),
        aBalance({
          condom_id: FEMALE_FC2.id,
          product: 'FC2 Free Female',
          unit_of_measure_id: 'u-carton',
          unit: 'carton',
          on_hand: 200,
        }),
      ],
    });

    const products = await screen.findByRole('group', { name: 'Product to send' });
    expect(
      await within(products).findByRole('radio', { name: 'FC2 · Female · Free, box of 100' }),
    ).toHaveAccessibleDescription(/None that can be reserved.*Out of stock/);
    expect(screen.getByText('of 500 box ordered')).toBeInTheDocument();
  });

  it('approves part of the order, and says when it will wait for stock', async () => {
    const user = userEvent.setup();
    const { requests } = render(gulu());

    await user.click(await screen.findByRole('radio', { name: 'FC2 · Female · Free, box of 100' }));
    const field = screen.getByLabelText('Quantity to approve');
    expect(field).toHaveValue('200');
    expect(screen.getByText(/Approving 200 box of the 500 box ordered/)).toBeInTheDocument();

    await user.clear(field);
    await user.type(field, '300');
    expect(
      screen.getByText(/Only 200 box can be reserved now, so the order will wait for stock/),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Approve 300 box' }));

    await waitFor(() => {
      expect(posts(requests)).toEqual([
        { url: action('review'), body: { condom_id: FEMALE_FC2.id, quantity_approved: 300 } },
        { url: action('check-stock'), body: {} },
      ]);
    });
  });

  it('will not approve more than was ordered', async () => {
    const user = userEvent.setup();
    const { requests } = render(gulu());

    const field = await screen.findByLabelText('Quantity to approve');
    await user.clear(field);
    await user.type(field, '600');
    await user.click(screen.getByRole('button', { name: 'Approve 600 box' }));
    expect(screen.getByText('You can approve at most the 500 box ordered.')).toBeInTheDocument();
    expect(field).toHaveFocus();
    expect(posts(requests)).toEqual([]);
  });

  it('shows the refusal next to the approval', async () => {
    const user = userEvent.setup();
    render(
      gulu(),
      {},
      {
        [`POST ${action('review')}`]: {
          status: 422,
          body: {
            success: false,
            message: 'the product chosen is not of the condom category requested',
          },
        },
      },
    );

    await user.click(await screen.findByRole('button', { name: 'Approve 500 box' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The order was not approved');
    expect(alert).toHaveTextContent('not of the condom category requested');
  });

  it('will not reject without a reason, and sends the reason the district reads', async () => {
    const user = userEvent.setup();
    const { requests } = render(gulu());

    await user.click(await screen.findByRole('button', { name: 'Reject order…' }));
    const reason = screen.getByLabelText('Why are you rejecting it?');
    // The panel replaces the button that opened it, so focus moves into it.
    expect(reason).toHaveFocus();
    const send = screen.getByRole('button', { name: 'Reject and tell Gulu' });
    await user.click(send);
    expect(screen.getByText('Say why the order is rejected.')).toBeInTheDocument();
    expect(posts(requests)).toEqual([]);

    await user.type(reason, '  Held for the national campaign  ');
    await user.click(send);
    await waitFor(() => {
      expect(posts(requests)).toEqual([
        { url: action('reject'), body: { reason: 'Held for the national campaign' } },
      ]);
    });
  });
});

describe('An approved order without a reservation', () => {
  const held = gulu({ order_status: 'on_hold', condom_id: FEMALE.id, quantity_approved: 500 });

  it('checks the stock again', async () => {
    const user = userEvent.setup();
    const { requests } = render(held, {
      balances: [aBalance({ condom_id: FEMALE.id, on_hand: 300 })],
    });

    expect(
      await screen.findByText('Waiting for stock', { selector: '[data-slot="alert-title"]' }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText('300 box can be reserved now, short of the 500 box approved.'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Check stock and reserve' }));
    await waitFor(() => {
      expect(posts(requests)).toEqual([{ url: action('check-stock'), body: {} }]);
    });
  });

  it('can be approved again with another product or quantity', async () => {
    const user = userEvent.setup();
    render(held);

    await user.click(await screen.findByRole('button', { name: 'Change product or quantity' }));
    expect(screen.getByText('Change the approval')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Engabu · Female · Free, box of 100' })).toBeChecked();
    expect(screen.getByLabelText('Quantity to approve')).toHaveValue('500');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Check stock and reserve' })).toBeInTheDocument();
  });
});

describe('Dispatching a confirmed order', () => {
  const confirmed = gulu({
    order_status: 'confirmed',
    condom_id: FEMALE.id,
    quantity_needed: 30,
    quantity_approved: 30,
  });
  const BATCHES = [
    aStockBatch({
      id: 'gone',
      batch_number: 'EXP-1',
      band: 'expired',
      expiry_date: '2026-11-19',
      days_remaining: -1,
      on_hand: 5,
    }),
    aStockBatch({
      id: 'near',
      batch_number: 'NEAR-1',
      band: 'under_1_month',
      expiry_date: '2026-11-30',
      days_remaining: 10,
      on_hand: 10,
    }),
    aStockBatch({ id: 'late', batch_number: 'LATE-1', band: 'ok', on_hand: 15 }),
    aStockBatch({
      id: 'none',
      batch_number: null,
      expiry_date: null,
      days_remaining: null,
      band: 'unknown',
      on_hand: 20,
    }),
    aStockBatch({ id: 'other', condom_id: FEMALE_FC2.id, batch_number: 'FC2-1', on_hand: 99 }),
  ];

  it('shows the batches first expiry first out, and needs a reason for one about to expire', async () => {
    const user = userEvent.setup();
    const { requests } = render(confirmed, { batches: BATCHES });

    const table = await screen.findByRole('table', { name: 'Batches this dispatch takes' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringMatching(/NEAR-1.*10 days left.*Under 1 month.*10 box/),
      expect.stringMatching(/LATE-1.*6 months or more.*15 box/),
      expect.stringMatching(/No batch number.*Expiry not recorded.*5 box/),
    ]);
    expect(screen.getByText(/NEAR-1 has under a month left/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Dispatch to Gulu' }));
    expect(
      screen.getByText('Say why stock with under a month left is dispatched.'),
    ).toBeInTheDocument();
    const reason = screen.getByLabelText('Why dispatch stock with under a month left?');
    expect(reason).toHaveFocus();
    expect(posts(requests)).toEqual([]);

    await user.type(reason, 'District out of stock; used within the week');
    await user.type(screen.getByLabelText(/Waybill number/), ' WB-104 ');
    await user.click(screen.getByRole('button', { name: 'Dispatch to Gulu' }));
    await waitFor(() => {
      expect(posts(requests)).toEqual([
        {
          url: action('dispatch'),
          body: {
            expiry_exception_reason: 'District out of stock; used within the week',
            waybill_number: 'WB-104',
          },
        },
      ]);
    });
  });

  it('sends less than reserved, releasing the rest', async () => {
    const user = userEvent.setup();
    const later = BATCHES.filter((batch) => batch.id !== 'near');
    const { requests } = render(confirmed, { batches: later });

    const field = await screen.findByLabelText('Quantity to dispatch');
    await user.clear(field);
    await user.type(field, '20');
    expect(screen.getByText(/the rest of the reservation is released/)).toBeInTheDocument();
    expect(
      screen.queryByLabelText('Why dispatch stock with under a month left?'),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Dispatch to Gulu' }));
    await waitFor(() => {
      expect(posts(requests)).toEqual([{ url: action('dispatch'), body: { quantity_issued: 20 } }]);
    });
  });

  it('can still reject the order, releasing the reservation', async () => {
    const user = userEvent.setup();
    render(confirmed, { batches: BATCHES });
    await user.click(await screen.findByRole('button', { name: 'Reject instead…' }));
    expect(screen.getByText(/and releases the reserved stock/)).toBeInTheDocument();
  });
});

describe('Orders the warehouse has finished with', () => {
  it('shows the dispatch and what the district counted', async () => {
    render(
      gulu({
        order_status: 'received',
        condom_id: FEMALE.id,
        quantity_approved: 500,
        quantity_issued: 500,
        quantity_received: 490,
        discrepancy_note: 'Ten boxes damaged',
        waybill_number: 'WB-104',
        driver_name: 'John Okello',
        driver_phone: '0772 000000',
      }),
    );

    expect(await screen.findByText('Gulu counted 490 box of 500 box')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Waybill WB-104' })).toBeInTheDocument();
    expect(screen.getByText('John Okello (0772 000000)')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Dispatch|Approve|Reject/ }),
    ).not.toBeInTheDocument();
  });

  it('shows why a rejected order was rejected, with nothing left to do', async () => {
    render(gulu({ order_status: 'rejected', rejection_reason: 'Held for the campaign' }));

    expect(await screen.findByText('This order was rejected')).toBeInTheDocument();
    expect(screen.getAllByText('Held for the campaign').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /Approve|Reject/ })).not.toBeInTheDocument();
  });
});
