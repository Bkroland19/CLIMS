import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppUnderTest } from '@/test/AppUnderTest';
import { aRequest } from '@/test/fulfilmentFixtures';
import { testRouter } from '@/test/navigation';
import { renderApp } from '@/test/renderApp';
import { FEMALE, JMS } from '@/test/dcfpFixtures';
import { aWarehouseStock, warehouseApi } from '@/test/warehouseFixtures';
import { aWarehouseOrder, warehouseOrderApi } from '@/test/warehouseOrderFixtures';

const REQUESTS = [
  aRequest({ id: 'WR-2026-0031', warehouse: 'JMS', district: 'Gulu', status: 'sent' }),
  aRequest({ id: 'WR-2026-0030', warehouse: 'NMS', district: 'Mukono', status: 'queued' }),
  aRequest({ id: 'WR-2026-0028', warehouse: 'NMS', district: 'Mbarara', status: 'under_review' }),
  aRequest({ id: 'WR-2026-0025', warehouse: 'NMS', district: 'Masaka', status: 'received' }),
];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-20T09:00:00Z') });
});
afterEach(() => {
  vi.useRealTimers();
});

function render(route: string, stock = aWarehouseStock()) {
  return renderApp(<AppUnderTest />, {
    route,
    signedIn: true,
    replies: [warehouseApi({ requests: REQUESTS, stock })],
  });
}

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
      replies: [
        warehouseOrderApi({
          orders: ORDERS,
          legacy: { requests: REQUESTS, stock: aWarehouseStock() },
        }),
      ],
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

describe('Warehouse stock', () => {
  it('shows each product by shelf life, and every batch with its status in words', async () => {
    render('/warehouse/stock?store=NMS');

    const batches = await screen.findByRole('table', { name: 'Batches at NMS' });
    const row = (batch: string) => within(batches).getByText(batch).closest('tr');
    await within(batches).findByText('ENG-2011-003');
    expect(row('ENG-2011-003')).toHaveTextContent('Expired');
    expect(row('ENG-2112-007')).toHaveTextContent('Near expiry');
    expect(row('ENG-2409-117')).toHaveTextContent('Dispatchable');
    // Male: 400,000 in batches with 6+ months; 20,000 near expiry; 5,000 expired.
    expect(screen.getByText('400,000')).toBeInTheDocument();
    expect(screen.getAllByText('5,000').length).toBeGreaterThan(0);
  });

  it('says when the store holds nothing', async () => {
    render(
      '/warehouse/stock?store=NMS',
      aWarehouseStock({ batches: [], stock: { male: 0, female: 0 } }),
    );
    expect(await screen.findByText('No stock held at NMS')).toBeInTheDocument();
  });
});

describe('Warehouse dashboard', () => {
  it('lists what needs doing at the store, each linking to the right request', async () => {
    render('/warehouse?store=NMS');

    const tasks = await screen.findByRole('list', { name: 'Needs your action' });
    const items = within(tasks).getAllByRole('listitem');
    expect(items.map((item) => within(item).getByRole('link').textContent)).toEqual([
      'Review request',
      'Check stock',
      'View stock',
      'View stock',
    ]);
    expect(
      within(items[0] ?? tasks).getByText('Review WR-2026-0028 from Mbarara'),
    ).toBeInTheDocument();
    expect(within(items[0] ?? tasks).getByRole('link')).toHaveAttribute(
      'href',
      '/warehouse/requests/WR-2026-0028?store=NMS',
    );
  });
});
