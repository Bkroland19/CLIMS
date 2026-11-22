import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { RecordedRequest } from '@/test/fakeAdapter';
import { renderApp } from '@/test/renderApp';

import type { StockBalance } from './api';
import { AskWarehouseForm } from './AskWarehouseForm';
import { ReceiveForm } from './ReceiveForm';
import { RecordStockDialog } from './RecordStockDialog';
import { SendFromStoreForm } from './SendFromStoreForm';

const ok = (data: unknown) => ({ status: 200, body: { success: true, data } });
const list = (items: unknown[]) => ok(items);
/** A 409 with the API's own words (`orders/workflow.go`, `inventory/handler.go`). */
const conflict = (message: string) => ({ status: 409, body: { success: false, message } });
const stamp = '2026-11-20T09:00:00Z';

const balance = (unit: string, available: number): StockBalance => ({
  store_id: 's-wakiso',
  store_name: 'Wakiso',
  store_type: 'district',
  district_id: 'd-wakiso',
  district_name: 'Wakiso',
  condom_id: 'p-engabu',
  product: 'Engabu · Male',
  unit_of_measure_id: `u-${unit.toLowerCase()}`,
  unit,
  on_hand: available,
  reserved: 0,
  available,
  incoming: 0,
  updated_at: stamp,
});
const stock = [balance('Box', 40), balance('Piece', 0)];

const rider = {
  id: 'r-okello',
  first_name: 'Peter',
  last_name: 'Okello',
  phone_number: '+256700000001',
  open_deliveries: 1,
};
const lookup = (id: string, name: string, active = true) => ({
  id,
  name,
  note: null,
  active,
  in_use: true,
  product_count: 1,
  created_at: stamp,
  updated_at: stamp,
});
const units = [lookup('u-box', 'Box'), lookup('u-carton', 'Carton', false)];
const stores = [
  {
    id: 's-nms',
    code: 'nms',
    name: 'National Medical Stores',
    store_type: 'national',
    district_id: null,
    district_name: null,
  },
  {
    id: 's-kampala',
    code: 'kampala',
    name: 'Kampala',
    store_type: 'district',
    district_id: 'd-kampala',
    district_name: 'Kampala',
  },
];
const products = [
  {
    id: 'p-engabu',
    category: null,
    type: null,
    brand: { id: 'b-engabu', name: 'Engabu' },
    unit: { id: 'u-box', name: 'Box' },
    pieces_per_unit: 144,
    active: true,
    in_use: true,
    created_at: stamp,
    updated_at: stamp,
  },
];

/** The lookups the forms read, then `write` for whatever they send. */
function api(write: (request: RecordedRequest) => { status: number; body?: unknown }) {
  return (request: RecordedRequest) => {
    if (request.method !== 'GET') return write(request);
    if (request.url === '/orders/riders') return list([rider]);
    if (request.url === '/locations/stores') return list(stores);
    if (request.url === '/catalogue/units') return list(units);
    if (request.url === '/catalogue/products') return list(products);
    return list([]);
  };
}
const done = () => ok({});
const movement = {
  id: 'm-1',
  store_id: 's-wakiso',
  store_name: 'Wakiso',
  condom_id: 'p-engabu',
  product: 'Engabu',
  unit_of_measure_id: 'u-box',
  unit: 'Box',
  reason: 'adjustment',
  quantity: -4,
  on_hand_after: 36,
  order_id: null,
  actor_id: 'u-1',
  note: 'Count found 4 short.',
  created_at: stamp,
};
const writes = (requests: RecordedRequest[]) =>
  requests.filter((request) => request.method !== 'GET');

describe('SendFromStoreForm', () => {
  it('offers only units in stock, checks the count against what is available, and sends', async () => {
    const user = userEvent.setup();
    const { requests } = renderApp(<SendFromStoreForm alertId="a-1" stock={stock} />, {
      signedIn: true,
      replies: [api(done)],
    });
    const form = screen.getByRole('form', { name: 'Send from the district store' });
    const quantity = within(form).getByRole('textbox', { name: /Quantity/ });

    // The one unit with stock is chosen for them.
    expect(within(form).getByRole('combobox', { name: /Unit/ })).toHaveTextContent(
      'Box · 40 available',
    );

    await user.click(within(form).getByRole('button', { name: 'Send stock' }));
    expect(await within(form).findByText('Enter a whole number of at least 1.')).toBeVisible();
    expect(within(form).getByText('Choose the rider who will deliver it.')).toBeVisible();
    expect(quantity).toHaveFocus();

    await user.type(quantity, '50');
    await user.click(within(form).getByRole('combobox', { name: /Rider/ }));
    await user.click(await screen.findByRole('option', { name: 'Peter Okello (1 delivery out)' }));
    await user.click(within(form).getByRole('button', { name: 'Send stock' }));
    expect(
      await within(form).findByText(/The district store has 40 available in this unit/),
    ).toBeVisible();
    expect(writes(requests)).toHaveLength(0);

    await user.clear(quantity);
    await user.type(quantity, '30');
    await user.click(within(form).getByRole('button', { name: 'Send stock' }));

    await waitFor(() => {
      expect(writes(requests)).toEqual([
        expect.objectContaining({
          method: 'POST',
          url: '/orders/a-1/actions/dispatch',
          body: { rider_id: 'r-okello', unit_of_measure_id: 'u-box', quantity_issued: 30 },
        }),
      ]);
    });
  });

  it('shows a refusal beside the quantity and keeps what was typed, sent from the keyboard', async () => {
    const user = userEvent.setup();
    renderApp(<SendFromStoreForm alertId="a-1" stock={stock} />, {
      signedIn: true,
      replies: [api(() => conflict('not enough available stock in the district store'))],
    });
    const form = screen.getByRole('form', { name: 'Send from the district store' });

    await user.click(within(form).getByRole('combobox', { name: /Rider/ }));
    await user.click(await screen.findByRole('option', { name: /Peter Okello/ }));
    const quantity = within(form).getByRole('textbox', { name: /Quantity/ });
    await user.type(quantity, '30{Enter}');

    expect(
      await within(form).findByText(
        'The district store does not have that much available. Send less, or ask the warehouse.',
      ),
    ).toBeVisible();
    expect(quantity).toHaveFocus();
    expect(quantity).toHaveValue('30');
    expect(within(form).getByRole('combobox', { name: /Rider/ })).toHaveTextContent('Peter Okello');
  });
});

describe('AskWarehouseForm', () => {
  it('offers only national warehouses and active units, and asks', async () => {
    const user = userEvent.setup();
    const { requests } = renderApp(<AskWarehouseForm alertId="a-1" />, {
      signedIn: true,
      replies: [api(done)],
    });
    const form = screen.getByRole('form', { name: 'Ask the warehouse' });

    await user.click(within(form).getByRole('button', { name: 'Ask the warehouse' }));
    expect(await within(form).findByText('Choose the warehouse to ask.')).toBeVisible();
    expect(within(form).getByText('Choose the unit to ask for.')).toBeVisible();
    expect(within(form).getByText('Enter a whole number of at least 1.')).toBeVisible();

    await user.click(within(form).getByRole('combobox', { name: /Warehouse/ }));
    expect(screen.queryByRole('option', { name: 'Kampala' })).not.toBeInTheDocument();
    await user.click(await screen.findByRole('option', { name: 'National Medical Stores' }));
    await user.click(within(form).getByRole('combobox', { name: /Unit/ }));
    expect(screen.queryByRole('option', { name: 'Carton' })).not.toBeInTheDocument();
    await user.click(await screen.findByRole('option', { name: 'Box' }));
    await user.type(within(form).getByRole('textbox', { name: /Quantity/ }), '200');
    await user.click(within(form).getByRole('button', { name: 'Ask the warehouse' }));

    await waitFor(() => {
      expect(writes(requests)).toEqual([
        expect.objectContaining({
          method: 'POST',
          url: '/orders/a-1/actions/request-replenishment',
          body: { warehouse_store_id: 's-nms', unit_of_measure_id: 'u-box', quantity: 200 },
        }),
      ]);
    });
  });
});

describe('ReceiveForm', () => {
  it('starts at what was sent and receives it as it is', async () => {
    const user = userEvent.setup();
    const { requests } = renderApp(<ReceiveForm requestId="req-1" issued={40} unit="Box" />, {
      signedIn: true,
      replies: [api(done)],
    });
    const form = screen.getByRole('form', { name: 'Receive the shipment' });

    expect(within(form).getByRole('textbox', { name: /Quantity received/ })).toHaveValue('40');
    await user.click(within(form).getByRole('button', { name: 'Receive shipment' }));

    await waitFor(() => {
      expect(writes(requests)).toEqual([
        expect.objectContaining({
          method: 'POST',
          url: '/orders/req-1/actions/receive',
          // No note is sent when there is nothing to explain; the API refuses a blank one.
          body: { quantity_received: 40 },
        }),
      ]);
    });
  });

  it('needs a note when the count differs, and keeps both when the API refuses', async () => {
    const user = userEvent.setup();
    const { requests } = renderApp(<ReceiveForm requestId="req-1" issued={40} unit="Box" />, {
      signedIn: true,
      replies: [api(() => conflict('order is not dispatched'))],
    });
    const form = screen.getByRole('form', { name: 'Receive the shipment' });
    const count = within(form).getByRole('textbox', { name: /Quantity received/ });
    const note = within(form).getByRole('textbox', { name: /What happened to the difference/ });

    await user.clear(count);
    await user.type(count, '35{Enter}');
    expect(
      await within(form).findByText('40 were sent. Say what happened to the difference.'),
    ).toBeVisible();
    expect(note).toHaveFocus();
    expect(writes(requests)).toHaveLength(0);

    await user.type(note, 'Five boxes were water-damaged.');
    await user.click(within(form).getByRole('button', { name: 'Receive shipment' }));

    expect(await within(form).findByText('That did not go through')).toBeVisible();
    expect(
      within(form).getByText(
        'This request is no longer waiting to be received. Reload to see where it is now.',
      ),
    ).toBeVisible();
    expect(count).toHaveValue('35');
    expect(note).toHaveValue('Five boxes were water-damaged.');
    expect(writes(requests)).toEqual([
      expect.objectContaining({
        body: { quantity_received: 35, discrepancy_note: 'Five boxes were water-damaged.' },
      }),
    ]);
  });
});

describe('RecordStockDialog', () => {
  async function fillAdjustment(user: ReturnType<typeof userEvent.setup>) {
    const dialog = await screen.findByRole('dialog', { name: 'Record stock' });
    await user.click(within(dialog).getByRole('radio', { name: /Adjustment/ }));
    await user.click(within(dialog).getByRole('combobox', { name: /Product/ }));
    await user.click(await screen.findByRole('option', { name: 'Engabu' }));
    await user.click(within(dialog).getByRole('combobox', { name: /Unit/ }));
    await user.click(await screen.findByRole('option', { name: 'Box' }));
    await user.type(within(dialog).getByRole('textbox', { name: /Change/ }), '-4');
    return dialog;
  }

  it('needs a reason for an adjustment, then records it', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { requests } = renderApp(<RecordStockDialog storeId="s-wakiso" onClose={onClose} />, {
      signedIn: true,
      replies: [api(() => ok(movement))],
    });

    const dialog = await fillAdjustment(user);
    await user.click(within(dialog).getByRole('button', { name: 'Record stock' }));
    expect(
      await within(dialog).findByText(
        'Say why the stock changed, for example what the count found.',
      ),
    ).toBeVisible();
    expect(writes(requests)).toHaveLength(0);

    await user.type(within(dialog).getByRole('textbox', { name: /Note/ }), 'Count found 4 short.');
    await user.click(within(dialog).getByRole('button', { name: 'Record stock' }));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
    expect(writes(requests)).toEqual([
      expect.objectContaining({
        method: 'POST',
        url: '/inventory/movements',
        body: {
          store_id: 's-wakiso',
          condom_id: 'p-engabu',
          unit_of_measure_id: 'u-box',
          reason: 'adjustment',
          quantity: -4,
          note: 'Count found 4 short.',
        },
      }),
    ]);
  });

  it('stays open with what was typed, the refusal beside the change', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderApp(<RecordStockDialog storeId="s-wakiso" onClose={onClose} />, {
      signedIn: true,
      replies: [api(() => conflict('insufficient stock: on hand would fall below reserved'))],
    });

    const dialog = await fillAdjustment(user);
    await user.type(within(dialog).getByRole('textbox', { name: /Note/ }), 'Count found 4 short.');
    await user.click(within(dialog).getByRole('button', { name: 'Record stock' }));

    expect(
      await within(dialog).findByText(
        'That would leave less on hand than is held for orders being sent. Record a smaller reduction.',
      ),
    ).toBeVisible();
    expect(within(dialog).getByRole('textbox', { name: /Change/ })).toHaveValue('-4');
    expect(within(dialog).getByRole('textbox', { name: /Note/ })).toHaveValue(
      'Count found 4 short.',
    );
    expect(onClose).not.toHaveBeenCalled();
  });
});
