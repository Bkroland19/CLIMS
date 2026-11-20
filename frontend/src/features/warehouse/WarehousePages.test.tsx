import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppUnderTest } from '@/test/AppUnderTest';
import { aRequest } from '@/test/fulfilmentFixtures';
import { testRouter } from '@/test/navigation';
import { renderApp } from '@/test/renderApp';
import { aWarehouseStock, warehouseApi } from '@/test/warehouseFixtures';

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
  it('lists the requests at the store in the address, and switches store by link', async () => {
    const user = userEvent.setup();
    const { requests } = render('/warehouse/requests?store=NMS');

    const table = await screen.findByRole('table', { name: 'District requests at NMS' });
    expect(await within(table).findByRole('link', { name: 'WR-2026-0030' })).toHaveAttribute(
      'href',
      '/warehouse/requests/WR-2026-0030?store=NMS',
    );
    expect(within(table).queryByText('WR-2026-0031')).not.toBeInTheDocument();
    expect(requests.some((request) => request.url === '/warehouses/NMS/requests')).toBe(true);
    // The sidebar badge counts what waits on NMS: one new and one queued request.
    expect(
      within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', {
        name: /District requests/,
      }),
    ).toHaveTextContent('2');

    const switcher = screen.getByRole('navigation', { name: 'Switch warehouse' });
    expect(within(switcher).getByRole('link', { name: 'NMS · Entebbe' })).toHaveAttribute(
      'aria-current',
      'true',
    );
    await user.click(within(switcher).getByRole('link', { name: 'JMS · Kampala' }));

    expect(testRouter.location).toBe('/warehouse/requests?store=JMS');
    expect(
      await within(
        await screen.findByRole('table', { name: 'District requests at JMS' }),
      ).findByRole('link', { name: 'WR-2026-0031' }),
    ).toBeInTheDocument();
  });

  it('remembers the store when a sidebar link leaves it out of the address', async () => {
    const { storage } = render('/warehouse/requests?store=JMS');
    await screen.findByRole('table', { name: 'District requests at JMS' });
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
    render('/warehouse/requests?store=NMS&status=new');
    const table = await screen.findByRole('table', { name: 'District requests at NMS' });
    expect(await within(table).findByRole('link', { name: 'WR-2026-0028' })).toBeInTheDocument();
    expect(within(table).queryByText('WR-2026-0030')).not.toBeInTheDocument();
    expect(
      within(screen.getByRole('navigation', { name: 'Filter requests by status' })).getByRole(
        'link',
        { name: /New/ },
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
