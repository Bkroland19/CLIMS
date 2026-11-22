import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { anOrder, aReport, BOX, dcfpApi, JMS } from '@/test/dcfpFixtures';
import { testRouter } from '@/test/navigation';
import { renderApp } from '@/test/renderApp';

import NewWarehouseOrderPage from './NewWarehouseOrderPage';
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
  it('sends the condom type, unit and quantity to the chosen warehouse, then opens the order', async () => {
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
    await user.click(screen.getByRole('combobox', { name: 'Unit' }));
    await user.click(await screen.findByRole('option', { name: 'box' }));
    await user.type(screen.getByLabelText('Quantity'), '500');
    expect(screen.getByText('In box.')).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Comment for the warehouse/), 'Two hotspots are out');
    await user.click(screen.getByRole('button', { name: 'Send order to JMS' }));

    await waitFor(() => {
      expect(testRouter.location).toBe('/dcfp/restock/new-1');
    });
    expect(requests.find((request) => request.method === 'POST')?.body).toEqual({
      warehouse_store_id: JMS.id,
      condom_category: 'female',
      quantity: 500,
      unit_of_measure_id: BOX.id,
      comment: 'Two hotspots are out',
    });
  });

  it('asks for the condom type and the unit, not a product', async () => {
    const user = userEvent.setup();
    const { requests } = renderApp(<NewWarehouseOrderPage />, {
      route: '/dcfp/restock/new',
      signedIn: true,
      replies: [dcfpApi()],
    });

    await user.type(await screen.findByLabelText('Quantity'), '20');
    await user.click(screen.getByRole('button', { name: 'Send order to NMS' }));

    expect(await screen.findByText('Choose male or female condoms.')).toBeInTheDocument();
    expect(screen.getByText('Choose the unit.')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Product' })).not.toBeInTheDocument();
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

    await user.click(await screen.findByRole('combobox', { name: 'Unit' }));
    await user.click(await screen.findByRole('option', { name: 'box' }));
    await user.type(screen.getByLabelText('Quantity'), '5');
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
});
