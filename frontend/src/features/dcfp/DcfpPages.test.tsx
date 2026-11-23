import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import {
  aBalance,
  anOrder,
  aReport,
  aStockout,
  BOX,
  dcfpApi,
  FEMALE,
  JMS,
} from '@/test/dcfpFixtures';
import { testRouter } from '@/test/navigation';
import { ADMIN_PERMISSIONS, renderApp, sessionWith } from '@/test/renderApp';

import NewWarehouseOrderPage from './NewWarehouseOrderPage';
import StockoutPage from './StockoutPage';
import StockoutsPage from './StockoutsPage';
import WarehouseOrderPage from './WarehouseOrderPage';
import WarehouseOrdersPage from './WarehouseOrdersPage';

describe('StockoutsPage', () => {
  it('shows each report with the hotspot, its message and who to call', async () => {
    renderApp(<StockoutsPage />, {
      route: '/dcfp/stockouts',
      signedIn: true,
      replies: [dcfpApi({ reports: [aReport()] })],
    });

    const table = await screen.findByRole('table', { name: 'Stockout notifications' });
    const row = (await within(table).findByText('Kisenyi Landing')).closest('tr');
    if (!row) throw new Error('The report has no row.');
    for (const text of [
      'Kisenyi, Central, Kampala',
      'female condoms',
      'Dispenser empty since Monday',
      'Peter Okello · 0700123456',
      'Grace Nakato',
    ]) {
      expect(within(row).getByText(text)).toBeInTheDocument();
    }
  });

  it('starts a warehouse order for the reported condom type', async () => {
    const user = userEvent.setup();
    renderApp(<StockoutsPage />, {
      route: '/dcfp/stockouts',
      signedIn: true,
      replies: [dcfpApi({ reports: [aReport()] })],
    });

    await user.click(await screen.findByRole('button', { name: 'Actions for Kisenyi Landing' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Order stock from a warehouse' }));

    expect(testRouter.location).toBe('/dcfp/restock/new?category=female');
  });

  it('shows how far each report has got and opens it to send stock', async () => {
    const user = userEvent.setup();
    renderApp(<StockoutsPage />, {
      route: '/dcfp/stockouts',
      signedIn: true,
      replies: [
        dcfpApi({
          reports: [
            aReport(),
            aReport({
              id: 'r2',
              hot_spot: { ...aReport().hot_spot, name: 'Kasenyi Bar' },
              status: 'fulfilled',
            }),
          ],
        }),
      ],
    });

    const table = await screen.findByRole('table', { name: 'Stockout notifications' });
    expect(await within(table).findByText('Needs stock')).toBeInTheDocument();
    expect(within(table).getByText('Fulfilled')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Actions for Kasenyi Bar' }));
    expect(screen.queryByRole('menuitem', { name: 'Send stock to the hotspot' })).toBeNull();
    await user.keyboard('{Escape}');

    await user.click(screen.getByRole('button', { name: 'Actions for Kisenyi Landing' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Send stock to the hotspot' }));
    expect(testRouter.location).toBe('/dcfp/stockouts/r1');
  });

  it('says so when no hotspot has reported', async () => {
    renderApp(<StockoutsPage />, {
      route: '/dcfp/stockouts',
      signedIn: true,
      replies: [dcfpApi()],
    });
    expect(await screen.findByText('No stockouts reported')).toBeInTheDocument();
  });
});

describe('WarehouseOrdersPage', () => {
  it('lists orders to NMS and JMS with their product, quantity and status', async () => {
    renderApp(<WarehouseOrdersPage />, {
      route: '/dcfp/restock',
      signedIn: true,
      replies: [
        dcfpApi({
          orders: [
            anOrder(),
            anOrder({ id: 'o2', ordered_from_store_id: JMS.id, order_status: 'dispatched' }),
            anOrder({ id: 'legacy', hot_spot_id: 'h1' }),
          ],
        }),
      ],
    });

    const table = await screen.findByRole('table', { name: 'Warehouse orders' });
    expect(await within(table).findAllByText('500 box')).toHaveLength(2);
    expect(within(table).getByText('NMS')).toBeInTheDocument();
    expect(within(table).getByText('On the way')).toBeInTheDocument();
    expect(within(table).getAllByRole('row')).toHaveLength(3); // header and two orders
  });
});

describe('NewWarehouseOrderPage', () => {
  it('sends the condom type and quantity, with no unit, to the chosen warehouse, then opens the order', async () => {
    const user = userEvent.setup();
    const { requests } = renderApp(<NewWarehouseOrderPage />, {
      route: '/dcfp/restock/new?category=female',
      signedIn: true,
      replies: [
        dcfpApi(
          {},
          {
            'POST /orders/warehouse-requests': {
              status: 201,
              body: { success: true, data: anOrder({ id: 'new-1' }) },
            },
          },
        ),
      ],
    });

    await user.click(await screen.findByRole('radio', { name: /JMS/ }));
    await user.click(screen.getByRole('button', { name: 'Send order to JMS' }));
    expect(
      await screen.findByText('Enter how many to order, as a whole number.'),
    ).toBeInTheDocument();

    expect(screen.getByRole('radio', { name: /Female condoms/ })).toBeChecked();
    await user.type(screen.getByLabelText('Quantity'), '500');
    await user.type(screen.getByLabelText(/Comment for the warehouse/), 'Two hotspots are out');
    await user.click(screen.getByRole('button', { name: 'Send order to JMS' }));

    await waitFor(() => {
      expect(testRouter.location).toBe('/dcfp/restock/new-1');
    });
    expect(requests.find((request) => request.method === 'POST')?.body).toEqual({
      warehouse_store_id: JMS.id,
      condom_category: 'female',
      quantity: 500,
      comment: 'Two hotspots are out',
    });
  });

  it('asks for the condom type and quantity, not a product or a unit', async () => {
    const user = userEvent.setup();
    const { requests } = renderApp(<NewWarehouseOrderPage />, {
      route: '/dcfp/restock/new',
      signedIn: true,
      replies: [dcfpApi()],
    });

    await user.type(await screen.findByLabelText('Quantity'), '20');
    await user.click(screen.getByRole('button', { name: 'Send order to NMS' }));

    expect(await screen.findByText('Choose male or female condoms.')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Product' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Unit' })).not.toBeInTheDocument();
    expect(requests.some((request) => request.method === 'POST')).toBe(false);
  });

  it('shows the API’s field message beside the field', async () => {
    const user = userEvent.setup();
    renderApp(<NewWarehouseOrderPage />, {
      route: '/dcfp/restock/new?category=female',
      signedIn: true,
      replies: [
        dcfpApi(
          {},
          {
            'POST /orders/warehouse-requests': {
              status: 422,
              body: {
                success: false,
                message: 'warehouse_store_id must name a national warehouse (NMS or JMS)',
                error: {
                  warehouse_store_id:
                    'warehouse_store_id must name a national warehouse (NMS or JMS)',
                },
              },
            },
          },
        ),
      ],
    });

    await user.type(await screen.findByLabelText('Quantity'), '5');
    await user.click(screen.getByRole('button', { name: 'Send order to NMS' }));

    expect(
      await screen.findByText('warehouse_store_id must name a national warehouse (NMS or JMS)'),
    ).toBeInTheDocument();
  });
});

describe('WarehouseOrderPage', () => {
  it('records a receipt that differs from the dispatch, with the reason', async () => {
    const user = userEvent.setup();
    const dispatched = anOrder({ order_status: 'dispatched', quantity_issued: 500 });
    const { requests } = renderApp(<WarehouseOrderPage />, {
      route: '/dcfp/restock/o1',
      signedIn: true,
      replies: [dcfpApi({ orders: [dispatched] })],
    });

    const counted = await screen.findByLabelText('Quantity counted');
    expect(counted).toHaveValue('500');
    await user.clear(counted);
    await user.type(counted, '480');
    await user.click(screen.getByRole('button', { name: 'Record receipt' }));
    expect(
      await screen.findByText('Say why the count differs from what was dispatched.'),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText('Why the count differs'), 'Two boxes damaged');
    await user.click(screen.getByRole('button', { name: 'Record receipt' }));

    await waitFor(() => {
      expect(requests.find((request) => request.method === 'POST')).toMatchObject({
        url: '/orders/o1/actions/receive',
        body: { quantity_received: 480, discrepancy_note: 'Two boxes damaged' },
      });
    });
  });

  it('has nothing to record while the order is with the warehouse', async () => {
    renderApp(<WarehouseOrderPage />, {
      route: '/dcfp/restock/o1',
      signedIn: true,
      replies: [dcfpApi({ orders: [anOrder({ order_status: 'on_hold' })] })],
    });

    expect(await screen.findByText('Waiting for stock at the warehouse')).toBeInTheDocument();
    expect(screen.queryByLabelText('Quantity counted')).not.toBeInTheDocument();
  });

  it('says why the warehouse rejected the order and offers a new one', async () => {
    const rejected = anOrder({
      order_status: 'rejected',
      condom_id: null,
      rejection_reason: 'Female condoms are held for the national campaign',
    });
    renderApp(<WarehouseOrderPage />, {
      route: '/dcfp/restock/o1',
      signedIn: true,
      replies: [dcfpApi({ orders: [rejected] })],
    });

    expect(await screen.findByText('NMS rejected this order')).toBeInTheDocument();
    expect(
      screen.getByText('Female condoms are held for the national campaign'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Place a new order' })).toHaveAttribute(
      'href',
      '/dcfp/restock/new?category=female',
    );
    expect(screen.queryByLabelText('Quantity counted')).not.toBeInTheDocument();
    expect(screen.queryByText('Quantity dispatched')).not.toBeInTheDocument();
  });

  it('points out a smaller approval and shows the dispatch transport', async () => {
    const { unmount } = renderApp(<WarehouseOrderPage />, {
      route: '/dcfp/restock/o1',
      signedIn: true,
      replies: [
        dcfpApi({ orders: [anOrder({ order_status: 'reviewed', quantity_approved: 300 })] }),
      ],
    });
    expect(await screen.findByText('NMS approved part of this order')).toBeInTheDocument();
    unmount();

    renderApp(<WarehouseOrderPage />, {
      route: '/dcfp/restock/o1',
      signedIn: true,
      replies: [
        dcfpApi({
          orders: [
            anOrder({
              order_status: 'dispatched',
              quantity_approved: 500,
              quantity_issued: 500,
              waybill_number: 'WB-104',
              driver_name: 'John Okello',
              driver_phone: '0772 000000',
            }),
          ],
        }),
      ],
    });
    expect(await screen.findByText('WB-104')).toBeInTheDocument();
    expect(screen.getByText('John Okello (0772 000000)')).toBeInTheDocument();
    expect(screen.queryByText('Vehicle')).not.toBeInTheDocument();
    expect(screen.queryByText('NMS approved part of this order')).not.toBeInTheDocument();
  });
});

describe('StockoutPage', () => {
  const delivered = aStockout({
    status: 'awaiting_acknowledgement',
    deliveries: [
      {
        id: 'd1',
        delivered_by_id: 'u-dcfp',
        note: null,
        created_at: '2026-11-22T08:00:00Z',
        lines: [
          {
            id: 'l1',
            category: 'female',
            condom_id: FEMALE.id,
            product: 'Engabu Free Female',
            unit_of_measure_id: BOX.id,
            quantity: 2,
            pieces: 200,
            acknowledged_pieces: null,
            acknowledged_at: null,
          },
        ],
      },
    ],
  });

  it('records a delivery from the district store with the products and quantities', async () => {
    const user = userEvent.setup();
    // The API answers the report's page with the delivery once it is recorded.
    let current = aStockout();
    const { requests } = renderApp(<StockoutPage />, {
      route: '/dcfp/stockouts/r1',
      signedIn: true,
      replies: [
        (request) => {
          if (request.method === 'POST') {
            current = delivered;
            return { status: 201, body: { success: true, data: delivered } };
          }
          return dcfpApi({ stockouts: [current], stock: [aBalance()] })(request);
        },
      ],
    });

    expect(await screen.findByRole('heading', { name: 'Kisenyi Landing' })).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Record delivery' }));
    expect(await screen.findByText('Choose a product.')).toBeInTheDocument();

    // Only active products of the category asked for, with what the store has.
    await user.click(screen.getByRole('combobox', { name: 'Product' }));
    expect(screen.queryByRole('option', { name: /Lifeguard/ })).toBeNull();
    await user.click(
      await screen.findByRole('option', {
        name: 'Engabu · Female · Free · 10 box available',
      }),
    );
    await user.type(screen.getByLabelText('Quantity'), '12');
    expect(screen.getByText('The district store has 10 available.')).toBeInTheDocument();
    await user.clear(screen.getByLabelText('Quantity'));
    await user.type(screen.getByLabelText('Quantity'), '2');
    expect(screen.getByText('box · 200 pieces')).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Note for the hotspot/), 'With the outreach team');
    await user.click(screen.getByRole('button', { name: 'Record delivery' }));

    await waitFor(() => {
      expect(requests.find((request) => request.method === 'POST')).toMatchObject({
        url: '/orders/stockouts/r1/deliveries',
        body: { lines: [{ condom_id: FEMALE.id, quantity: 2 }], note: 'With the outreach team' },
      });
    });
    const sent = requests.find((request) => request.method === 'POST')?.body as {
      client_reference?: unknown;
    };
    // A reference of the app's own, so a retried send is recorded once.
    expect(typeof sent.client_reference).toBe('string');
    expect(await screen.findByText('200 pieces sent · not confirmed yet')).toBeInTheDocument();
  });

  it('asks why when stock that expires soon would leave the store, and resends once', async () => {
    const user = userEvent.setup();
    let attempt = 0;
    const { requests } = renderApp(<StockoutPage />, {
      route: '/dcfp/stockouts/r1',
      signedIn: true,
      replies: [
        (request) => {
          if (request.method !== 'POST')
            return dcfpApi({ stockouts: [aStockout()], stock: [aBalance()] })(request);
          attempt += 1;
          return attempt === 1
            ? {
                status: 422,
                body: {
                  success: false,
                  message: 'stock expiring within one month needs an expiry_exception_reason',
                  error: { expiry_exception_reason: 'Batch B12 expires on 2026-12-10.' },
                },
              }
            : { status: 201, body: { success: true, data: delivered } };
        },
      ],
    });

    await user.click(await screen.findByRole('combobox', { name: 'Product' }));
    await user.click(await screen.findByRole('option', { name: /Engabu/ }));
    await user.type(screen.getByLabelText('Quantity'), '2');
    await user.click(screen.getByRole('button', { name: 'Record delivery' }));

    expect(await screen.findByText(/Batch B12 expires on 2026-12-10/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Record delivery' }));
    expect(await screen.findByText('Give a reason to send it.')).toBeInTheDocument();
    await user.type(
      screen.getByLabelText('Why send stock that expires soon?'),
      'Used within two weeks',
    );
    await user.click(screen.getByRole('button', { name: 'Record delivery' }));

    await waitFor(() => {
      expect(requests.filter((request) => request.method === 'POST')).toHaveLength(2);
    });
    const [first, second] = requests.filter((request) => request.method === 'POST');
    expect(second?.body).toMatchObject({ expiry_exception_reason: 'Used within two weeks' });
    // The same delivery, so a retry the API already has is recorded once.
    expect((second?.body as { client_reference: string }).client_reference).toBe(
      (first?.body as { client_reference: string }).client_reference,
    );
  });

  it('says who can allow it when the account may not record deliveries', async () => {
    renderApp(<StockoutPage />, {
      route: '/dcfp/stockouts/r1',
      session: sessionWith(
        ADMIN_PERMISSIONS.filter((code) => code !== 'orders:supply_hotspots'),
        ['dfcp'],
      ),
      replies: [dcfpApi({ stockouts: [aStockout()], stock: [aBalance()] })],
    });

    expect(await screen.findByText('You cannot send stock from here yet')).toBeInTheDocument();
    expect(screen.getByText(/Ask an administrator to give your role/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Record delivery' })).toBeNull();
  });

  it('explains a refusal from the API in words the DCFP can act on', async () => {
    const user = userEvent.setup();
    renderApp(<StockoutPage />, {
      route: '/dcfp/stockouts/r1',
      signedIn: true,
      replies: [
        dcfpApi(
          { stockouts: [aStockout()], stock: [aBalance()] },
          {
            'POST /orders/stockouts/r1/deliveries': {
              status: 403,
              body: { success: false, message: 'permission denied' },
            },
          },
        ),
      ],
    });

    await user.click(await screen.findByRole('combobox', { name: 'Product' }));
    await user.click(await screen.findByRole('option', { name: /Engabu/ }));
    await user.type(screen.getByLabelText('Quantity'), '2');
    await user.click(screen.getByRole('button', { name: 'Record delivery' }));

    expect(await screen.findByText('The delivery was not recorded')).toBeInTheDocument();
    expect(screen.getByText(/Ask an administrator to give your role/)).toBeInTheDocument();
  });

  it('still sends when the store’s stock cannot be read', async () => {
    renderApp(<StockoutPage />, {
      route: '/dcfp/stockouts/r1',
      signedIn: true,
      replies: [dcfpApi({ stockouts: [aStockout()], stock: 403 })],
    });

    expect(
      await screen.findByText(/stock could not be shown. CLIMS still checks it when you send./),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Record delivery' })).toBeInTheDocument();
  });

  it('shows what arrived and offers nothing to send once fulfilled', async () => {
    const line = delivered.deliveries[0]!.lines[0]!;
    renderApp(<StockoutPage />, {
      route: '/dcfp/stockouts/r1',
      signedIn: true,
      replies: [
        dcfpApi({
          stockouts: [
            aStockout({
              status: 'fulfilled',
              fulfilled_at: '2026-11-22T10:00:00Z',
              deliveries: [
                {
                  ...delivered.deliveries[0]!,
                  lines: [
                    { ...line, acknowledged_pieces: 180, acknowledged_at: '2026-11-22T10:00:00Z' },
                  ],
                },
              ],
            }),
          ],
        }),
      ],
    });

    expect(await screen.findByText('200 sent · 180 received')).toBeInTheDocument();
    expect(screen.getAllByText('Fulfilled').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Record delivery' })).toBeNull();
  });
});
