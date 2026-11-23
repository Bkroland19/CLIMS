import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppUnderTest } from '@/test/AppUnderTest';
import { FEMALE, NMS } from '@/test/dcfpFixtures';
import { ADMIN_PERMISSIONS, renderApp, sessionWith } from '@/test/renderApp';
import {
  aBalance,
  aStockBatch,
  aStoreSummary,
  aWarehouseOrder,
  warehouseOrderApi,
} from '@/test/warehouseOrderFixtures';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-20T09:00:00Z') });
});
afterEach(() => {
  vi.useRealTimers();
});

// 800 boxes on hand: 100 expired and 200 reserved for district orders leave 500 free.
const DATA = {
  summary: aStoreSummary(),
  balances: [aBalance({ on_hand: 800, reserved: 200 })],
  batches: [
    aStockBatch({ id: 'b-gone', batch_number: 'EXP-1', band: 'expired', on_hand: 100 }),
    aStockBatch({
      id: 'b-near',
      batch_number: 'NEAR-1',
      expiry_date: '2026-12-05',
      days_remaining: 15,
      band: 'under_1_month',
      on_hand: 50,
    }),
    aStockBatch({ id: 'b-late', batch_number: 'LATE-1', on_hand: 650 }),
  ],
};

type Writes = Parameters<typeof warehouseOrderApi>[1];

function renderStock(route: string, writes: Writes = {}, permissions = ADMIN_PERMISSIONS) {
  return renderApp(<AppUnderTest />, {
    route,
    session: sessionWith(permissions),
    replies: [warehouseOrderApi(DATA, writes)],
  });
}

const sent = aWarehouseOrder({
  id: 'o-sent',
  condom_id: FEMALE.id,
  order_status: 'dispatched',
  unrequested: true,
});

describe('Dispatching to a district before it orders', () => {
  it('sends free stock first expiry first out, with a reason for stock about to expire', async () => {
    const user = userEvent.setup();
    const { requests } = renderStock('/warehouse/stock?store=NMS', {
      'POST /orders/district-dispatches': { status: 201, body: { success: true, data: [sent] } },
    });

    await user.click(await screen.findByRole('button', { name: 'Dispatch to district' }));
    const sheet = await screen.findByRole('dialog', { name: 'Dispatch to a district from NMS' });
    await within(sheet).findByRole('combobox', { name: 'Product' });
    await user.click(within(sheet).getByRole('button', { name: 'Dispatch' }));
    expect(within(sheet).getByText('Choose the district store to send to.')).toBeInTheDocument();
    expect(within(sheet).getByText('Choose a product.')).toBeInTheDocument();

    await user.click(within(sheet).getByRole('combobox', { name: /District store/ }));
    await user.click(await screen.findByRole('option', { name: 'Wakiso' }));
    await user.click(within(sheet).getByRole('combobox', { name: 'Product' }));
    await user.click(await screen.findByRole('option', { name: /Engabu/ }));
    expect(within(sheet).getByText('Free to dispatch: 500 box.')).toBeInTheDocument();

    // More than the free stock is refused before anything is sent.
    const quantity = within(sheet).getByLabelText('Quantity');
    await user.type(quantity, '600');
    await user.click(within(sheet).getByRole('button', { name: 'Dispatch to Wakiso' }));
    expect(
      within(sheet).getByText('Free to dispatch: 500 box. Enter that or less.'),
    ).toBeInTheDocument();
    expect(requests.some((request) => request.method === 'POST')).toBe(false);

    // 120 takes the 50 about to expire first, so a reason is needed.
    await user.clear(quantity);
    await user.type(quantity, '120');
    expect(within(sheet).getByText('NEAR-1')).toBeInTheDocument();
    expect(within(sheet).getByText('LATE-1')).toBeInTheDocument();
    expect(within(sheet).queryByText('EXP-1')).not.toBeInTheDocument();
    await user.click(within(sheet).getByRole('button', { name: 'Dispatch to Wakiso' }));
    expect(
      within(sheet).getByText('Say why stock with under a month left is dispatched.'),
    ).toBeInTheDocument();
    await user.type(
      within(sheet).getByLabelText(/Why dispatch stock with under a month left/),
      'Wakiso uses it within the week',
    );
    await user.type(within(sheet).getByLabelText(/Note to the district/), 'Quarterly allocation');
    expect(within(sheet).queryByLabelText(/Waybill number/)).not.toBeInTheDocument();
    await user.type(within(sheet).getByLabelText(/Vehicle registration/), 'UAX 123B');
    expect(within(sheet).getByText('120 box')).toBeInTheDocument();

    await user.click(within(sheet).getByRole('button', { name: 'Dispatch to Wakiso' }));
    await waitFor(() => {
      expect(requests.find((request) => request.method === 'POST')).toMatchObject({
        url: '/orders/district-dispatches',
        body: {
          warehouse_store_id: NMS.id,
          district_store_id: 'store-wakiso',
          lines: [{ condom_id: FEMALE.id, quantity: 120 }],
          note: 'Quarterly allocation',
          expiry_exception_reason: 'Wakiso uses it within the week',
          vehicle_registration: 'UAX 123B',
        },
      });
    });
    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: 'Dispatch to a district from NMS' }),
      ).not.toBeInTheDocument();
    });
  });

  it('opens from a link, and shows a refused product on its own line', async () => {
    const user = userEvent.setup();
    renderStock('/warehouse/stock?store=NMS&dispatch=1', {
      'POST /orders/district-dispatches': {
        status: 409,
        body: {
          success: false,
          message:
            'line 1: not enough free stock: on hand less reserved and expired stock does not cover it',
        },
      },
    });

    const sheet = await screen.findByRole('dialog', { name: 'Dispatch to a district from NMS' });
    await user.click(await within(sheet).findByRole('combobox', { name: /District store/ }));
    await user.click(await screen.findByRole('option', { name: 'Gulu' }));
    await user.click(within(sheet).getByRole('combobox', { name: 'Product' }));
    await user.click(await screen.findByRole('option', { name: /Engabu/ }));
    await user.type(within(sheet).getByLabelText('Quantity'), '400');
    await user.type(
      within(sheet).getByLabelText(/Why dispatch stock with under a month left/),
      'Gulu is out',
    );
    await user.click(within(sheet).getByRole('button', { name: 'Dispatch to Gulu' }));

    expect(await within(sheet).findByText('This product was refused')).toBeInTheDocument();
    expect(within(sheet).getByText(/^Not enough free stock/)).toBeInTheDocument();
    expect(within(sheet).getByText('Nothing was dispatched')).toBeInTheDocument();
  });

  it('is offered only to people who may dispatch', async () => {
    renderStock(
      '/warehouse/stock?store=NMS',
      {},
      ADMIN_PERMISSIONS.filter((code) => code !== 'orders:process'),
    );
    expect(await screen.findByRole('button', { name: 'Register stock' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Dispatch to district' })).not.toBeInTheDocument();
  });
});
