import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppUnderTest } from '@/test/AppUnderTest';
import { testRouter } from '@/test/navigation';
import { renderApp } from '@/test/renderApp';
import { BOX, FEMALE, JMS, NMS } from '@/test/dcfpFixtures';
import type { RecordedRequest } from '@/test/fakeAdapter';
import {
  aBalance,
  aMovement,
  aStockBatch,
  aWarehouseOrder,
  warehouseOrderApi,
} from '@/test/warehouseOrderFixtures';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-20T09:00:00Z') });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('District requests', () => {
  const ORDERS = [
    aWarehouseOrder({ id: 'o-gulu', ordered_for_store_id: 'store-gulu' }),
    aWarehouseOrder({
      id: 'o-mukono',
      ordered_for_store_id: 'store-mukono',
      condom_id: FEMALE.id,
      order_status: 'confirmed',
      quantity_needed: 500,
      quantity_approved: 300,
    }),
    aWarehouseOrder({
      id: 'o-held',
      ordered_for_store_id: 'store-wakiso',
      order_status: 'on_hold',
    }),
    aWarehouseOrder({
      id: 'o-wakiso',
      ordered_for_store_id: 'store-wakiso',
      order_status: 'received',
    }),
    aWarehouseOrder({
      id: 'o-jms',
      ordered_for_store_id: 'store-wakiso',
      ordered_from_store_id: JMS.id,
    }),
  ];

  function renderOrders(route: string) {
    return renderApp(<AppUnderTest />, {
      route,
      signedIn: true,
      replies: [warehouseOrderApi({ orders: ORDERS, batches: BATCHES, balances: [aBalance()] })],
    });
  }

  it('lists the orders at the store in the address, and switches store by link', async () => {
    const user = userEvent.setup();
    renderOrders('/warehouse/requests?store=NMS');

    const table = await screen.findByRole('table', { name: 'District orders at NMS' });
    expect(await within(table).findByRole('link', { name: 'Gulu' })).toHaveAttribute(
      'href',
      '/warehouse/requests/o-gulu?store=NMS',
    );
    expect(within(table).getByText('300 box approved')).toBeInTheDocument();
    expect(within(table).getAllByText('Female condoms')).toHaveLength(3); // product not chosen yet
    expect(within(table).getAllByRole('link')).toHaveLength(4);
    // The sidebar badge counts what waits on NMS: one to decide and one to dispatch.
    await waitFor(() => {
      expect(
        within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', {
          name: /District requests/,
        }),
      ).toHaveTextContent('2');
    });

    const switcher = screen.getByRole('navigation', { name: 'Switch warehouse' });
    expect(within(switcher).getByRole('link', { name: 'NMS · Entebbe' })).toHaveAttribute(
      'aria-current',
      'true',
    );
    await user.click(within(switcher).getByRole('link', { name: 'JMS · Kampala' }));

    expect(testRouter.location).toBe('/warehouse/requests?store=JMS');
    const jms = await screen.findByRole('table', { name: 'District orders at JMS' });
    expect(await within(jms).findByRole('link', { name: 'Wakiso' })).toHaveAttribute(
      'href',
      '/warehouse/requests/o-jms?store=JMS',
    );
  });

  it('remembers the store when a sidebar link leaves it out of the address', async () => {
    const { storage } = renderOrders('/warehouse/requests?store=JMS');
    await screen.findByRole('table', { name: 'District orders at JMS' });
    await waitFor(() => {
      expect(storage.getItem('clims.warehouse.store')).toBe('"JMS"');
    });

    await userEvent.setup().click(
      within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', {
        name: 'Stock',
      }),
    );
    expect(testRouter.location).toBe('/warehouse/stock');
    expect(await screen.findByRole('heading', { name: 'Batches at JMS' })).toBeInTheDocument();
  });

  it('filters by status from the address', async () => {
    renderOrders('/warehouse/requests?store=NMS&status=on_hold');
    const table = await screen.findByRole('table', { name: 'District orders at NMS' });
    expect(await within(table).findByRole('link', { name: 'Wakiso' })).toHaveAttribute(
      'href',
      '/warehouse/requests/o-held?store=NMS',
    );
    expect(within(table).queryByText('Gulu')).not.toBeInTheDocument();
    expect(
      within(screen.getByRole('navigation', { name: 'Filter orders by status' })).getByRole(
        'link',
        { name: /Waiting for stock/ },
      ),
    ).toHaveAttribute('aria-current', 'true');
  });
});

/** NMS's FC2 boxes: one batch expired, one under a month, one fine, and some never batched. */
const BATCHES = [
  aStockBatch({
    id: 'b-old',
    batch_number: 'FC2-2311-090',
    expiry_date: '2026-11-01',
    days_remaining: -19,
    band: 'expired',
    on_hand: 40,
  }),
  aStockBatch({
    id: 'b-near',
    batch_number: 'FC2-2405-002',
    expiry_date: '2026-12-10',
    days_remaining: 20,
    band: 'under_1_month',
    on_hand: 60,
  }),
  aStockBatch({ id: 'b-late', batch_number: 'FC2-2502-118', on_hand: 600 }),
  aStockBatch({
    id: 'b-none',
    batch_number: null,
    expiry_date: null,
    days_remaining: null,
    band: 'unknown',
    on_hand: 210,
  }),
];

describe('Warehouse stock', () => {
  function renderStock(route: string, data: Parameters<typeof warehouseOrderApi>[0] = {}) {
    return renderApp(<AppUnderTest />, {
      route,
      signedIn: true,
      replies: [
        warehouseOrderApi({
          balances: [aBalance({ on_hand: 910, reserved: 300, available: 610 })],
          batches: BATCHES,
          movements: [
            aMovement({
              id: 'm2',
              reason: 'dispatch',
              quantity: -80,
              order_id: 'o1',
              note: null,
              batch_number: null,
              expiry_date: null,
            }),
            aMovement(),
          ],
          ...data,
        }),
      ],
    });
  }

  it('shows what can be reserved, every batch by shelf life, and the ledger in words', async () => {
    renderStock('/warehouse/stock?store=NMS');

    // 910 on hand, less 300 reserved and 40 expired.
    expect(await screen.findByText('570')).toBeInTheDocument();
    expect(screen.getByText('box free to reserve')).toBeInTheDocument();
    const batches = await screen.findByRole('table', { name: 'Batches at NMS' });
    const row = (batch: string) => within(batches).getByText(batch).closest('tr');
    expect(row('FC2-2311-090')).toHaveTextContent('Expired');
    expect(row('FC2-2405-002')).toHaveTextContent('Under 1 month');
    expect(row('No batch number')).toHaveTextContent('Count it and record its batches');

    const ledger = await screen.findByRole('table', { name: 'Stock movements at NMS' });
    expect(within(ledger).getByText('UNFPA consignment, delivery note DN-118')).toBeInTheDocument();
    expect(within(ledger).getByRole('link', { name: 'Dispatched' })).toHaveAttribute(
      'href',
      '/warehouse/requests/o1?store=NMS',
    );
    expect(within(ledger).getByText('−80')).toBeInTheDocument();
  });

  it('filters batches by shelf life from the address', async () => {
    renderStock('/warehouse/stock?store=NMS&band=under_1_month');
    const batches = await screen.findByRole('table', { name: 'Batches at NMS' });
    expect(await within(batches).findByText('FC2-2405-002')).toBeInTheDocument();
    expect(within(batches).queryByText('FC2-2502-118')).not.toBeInTheDocument();
  });

  it('records a stock count as the difference from what is held', async () => {
    const user = userEvent.setup();
    const { requests } = renderStock('/warehouse/stock?store=NMS');

    await user.click(await screen.findByRole('button', { name: 'Actions for batch FC2-2502-118' }));
    await user.click(screen.getByRole('menuitem', { name: 'Adjust stock…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Adjust batch FC2-2502-118' });
    const counted = within(dialog).getByLabelText('Counted on the shelf');
    expect(counted).toHaveValue('600');
    await user.clear(counted);
    await user.type(counted, '590');
    expect(within(dialog).getByText('Recorded as −10 box in FC2-2502-118.')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Record the count' }));
    expect(within(dialog).getByText('Say why the stock changed.')).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText('Why'), 'Quarterly count');
    await user.click(within(dialog).getByRole('button', { name: 'Record the count' }));
    await waitFor(() => {
      expect(requests.find((request: RecordedRequest) => request.method === 'POST')).toMatchObject({
        url: '/inventory/movements',
        body: {
          store_id: NMS.id,
          condom_id: FEMALE.id,
          unit_of_measure_id: BOX.id,
          reason: 'adjustment',
          quantity: -10,
          note: 'Stock count: Quarterly count',
          batch_number: 'FC2-2502-118',
          expiry_date: '2028-06-30',
        },
      });
    });
  });

  it('writes off an expired batch in full by default', async () => {
    const user = userEvent.setup();
    const { requests } = renderStock('/warehouse/stock?store=NMS');

    await user.click(await screen.findByRole('button', { name: 'Actions for batch FC2-2311-090' }));
    await user.click(screen.getByRole('menuitem', { name: 'Write off…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Write off batch FC2-2311-090' });
    expect(within(dialog).getByRole('radio', { name: /Expired/ })).toBeChecked();
    expect(within(dialog).getByLabelText('How many')).toHaveValue('40');
    await user.type(within(dialog).getByLabelText('Why'), 'Incinerated');
    await user.click(within(dialog).getByRole('button', { name: 'Write off' }));
    await waitFor(() => {
      expect(
        requests.find((request: RecordedRequest) => request.method === 'POST')?.body,
      ).toMatchObject({
        reason: 'adjustment',
        quantity: -40,
        note: 'Expired, written off: Incinerated',
        batch_number: 'FC2-2311-090',
      });
    });
  });

  it('says when the store holds nothing', async () => {
    renderStock('/warehouse/stock?store=NMS', { balances: [], batches: [], movements: [] });
    expect(await screen.findByText('No stock recorded at NMS yet')).toBeInTheDocument();
    expect(await screen.findByText('No batches held at NMS')).toBeInTheDocument();
  });
});

describe('Recording a delivery', () => {
  it('checks each batch, records it, and keeps the product for the next batch', async () => {
    const user = userEvent.setup();
    const { requests } = renderApp(<AppUnderTest />, {
      route: '/warehouse/stock/receive?store=NMS',
      signedIn: true,
      replies: [
        warehouseOrderApi(
          {},
          {
            'POST /inventory/movements': {
              status: 201,
              body: { success: true, data: aMovement({ id: 'm9', batch_number: 'FC2-2611-001' }) },
            },
          },
        ),
      ],
    });

    await user.click(await screen.findByRole('button', { name: 'Record this batch' }));
    expect(screen.getByText('Choose the product delivered.')).toBeInTheDocument();
    expect(screen.getByText('Enter the batch number on the carton.')).toBeInTheDocument();
    expect(requests.some((request) => request.method === 'POST')).toBe(false);

    await user.click(screen.getByRole('combobox', { name: 'Product' }));
    await user.click(await screen.findByRole('option', { name: /Engabu/ }));
    // The unit starts as the product's catalogue unit.
    expect(screen.getByRole('combobox', { name: 'Unit' })).toHaveTextContent('box');
    await user.type(screen.getByLabelText('Batch number'), ' FC2-2611-001 ');
    await user.type(screen.getByLabelText('Expiry date'), '2026-11-19');
    await user.type(screen.getByLabelText('Quantity received'), '500');
    await user.type(screen.getByLabelText(/Where it came from/), 'UNFPA, DN-120');
    await user.click(screen.getByRole('button', { name: 'Record this batch' }));
    expect(screen.getByText(/This batch has expired/)).toBeInTheDocument();

    const expiry = screen.getByLabelText('Expiry date');
    await user.clear(expiry);
    await user.type(expiry, '2029-06-30');
    await user.click(screen.getByRole('button', { name: 'Record this batch' }));
    await waitFor(() => {
      expect(requests.find((request) => request.method === 'POST')).toMatchObject({
        url: '/inventory/movements',
        body: {
          store_id: NMS.id,
          condom_id: FEMALE.id,
          unit_of_measure_id: BOX.id,
          reason: 'receipt',
          quantity: 500,
          batch_number: 'FC2-2611-001',
          expiry_date: '2029-06-30',
          note: 'UNFPA, DN-120',
        },
      });
    });
    const recorded = await screen.findByRole('list', { name: 'Batches recorded' });
    expect(recorded).toHaveTextContent('FC2-2611-001 · 500 box of Engabu · Female · Free');
    expect(screen.getByLabelText('Batch number')).toHaveValue('');
    expect(screen.getByRole('combobox', { name: 'Product' })).toHaveTextContent(/Engabu/);
    expect(screen.getByRole('link', { name: 'Done' })).toHaveAttribute(
      'href',
      '/warehouse/stock?store=NMS',
    );
  });
});

describe('Warehouse dashboard', () => {
  it('lists what needs doing at the store, each linking to the right place', async () => {
    renderApp(<AppUnderTest />, {
      route: '/warehouse?store=NMS',
      signedIn: true,
      replies: [
        warehouseOrderApi({
          orders: [
            aWarehouseOrder({ id: 'o-gulu', ordered_for_store_id: 'store-gulu' }),
            aWarehouseOrder({
              id: 'o-mukono',
              ordered_for_store_id: 'store-mukono',
              condom_id: FEMALE.id,
              order_status: 'confirmed',
              quantity_approved: 300,
            }),
          ],
          batches: BATCHES,
          balances: [aBalance()],
        }),
      ],
    });

    const tasks = await screen.findByRole('list', { name: 'Needs your action' });
    await waitFor(() => {
      expect(within(tasks).getAllByRole('listitem')).toHaveLength(5);
    });
    const items = within(tasks).getAllByRole('listitem');
    expect(items.map((item) => within(item).getByRole('link').textContent)).toEqual([
      'Decide',
      'Dispatch',
      'View expired',
      'View batches',
      'View stock',
    ]);
    expect(
      within(items[0] ?? tasks).getByText("Decide on Gulu's order for 500 box"),
    ).toBeInTheDocument();
    expect(within(items[0] ?? tasks).getByRole('link')).toHaveAttribute(
      'href',
      '/warehouse/requests/o-gulu?store=NMS',
    );
    expect(within(items[2] ?? tasks).getByRole('link')).toHaveAttribute(
      'href',
      '/warehouse/stock?band=expired&store=NMS',
    );
  });
});
