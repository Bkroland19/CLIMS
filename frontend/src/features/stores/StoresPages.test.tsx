import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { RecordedRequest } from '@/test/fakeAdapter';
import { renderApp } from '@/test/renderApp';

import GeographyPage from './GeographyPage';
import StoresPage from './StoresPage';

const geography = {
  synced_at: '2026-11-20T03:00:00Z',
  counts: { regions: 4, districts: 146, subcounties: 2184, facilities: 7412 },
  regions: [
    {
      id: 'central',
      name: 'Central',
      district_count: 27,
      districts: [
        {
          id: 'wakiso',
          name: 'Wakiso',
          store_count: 1,
          hotspot_count: 9,
          subcounties: [{ id: 'katabi', name: 'Katabi TC', facility_count: 14, hotspot_count: 3 }],
        },
      ],
    },
  ],
};

const ok = (data: unknown) => ({ status: 200, body: { success: true, data } });

describe('StoresPage', () => {
  it('lists national warehouses and district stores with live stock in separate units', async () => {
    renderApp(<StoresPage />, {
      signedIn: true,
      replies: [
        ok([
          {
            id: 'store-nms',
            name: 'NMS · Entebbe',
            kind: 'national',
            region: 'Central',
            district: 'Wakiso',
            code: 'nms',
            user_count: 1,
            on_hand: [
              { category: 'male', unit_id: 'box', unit: 'boxes', quantity: 20 },
              { category: 'male', unit_id: 'piece', unit: 'pieces', quantity: 100 },
              { category: 'female', unit_id: 'piece', unit: 'pieces', quantity: 118_000 },
              { category: null, unit_id: 'piece', unit: 'pieces', quantity: 7 },
            ],
          },
        ]),
      ],
    });

    const row = (await screen.findByText('NMS · Entebbe')).closest('tr');
    if (!row) throw new Error('NMS has no table row');
    expect(within(row).getByText('Male: 20 boxes')).toBeInTheDocument();
    expect(within(row).getByText('Male: 100 pieces')).toBeInTheDocument();
    expect(within(row).getByText('Female: 118,000 pieces')).toBeInTheDocument();
    expect(within(row).getByText('Unclassified: 7 pieces')).toBeInTheDocument();
    expect(screen.queryByText('Sample data')).not.toBeInTheDocument();
  });

  it('says so when there are no stores', async () => {
    renderApp(<StoresPage />, { signedIn: true, replies: [ok([])] });
    expect(await screen.findByText('No stores yet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument();
  });

  it('keeps stores with no stock visible', async () => {
    renderApp(<StoresPage />, {
      signedIn: true,
      replies: [
        ok([
          {
            id: 'store-wakiso',
            name: 'Wakiso district store',
            kind: 'district',
            region: 'Central',
            district: 'Wakiso',
            code: 'wakiso',
            user_count: 0,
            on_hand: [],
          },
        ]),
      ],
    });
    expect(await screen.findByText('Wakiso district store')).toBeInTheDocument();
    expect(screen.getByText('No stock')).toBeInTheDocument();
    expect(screen.queryByText('No stores yet')).not.toBeInTheDocument();
  });

  it.each([403, 500])('does not disguise a %s response as an empty list', async (status) => {
    renderApp(<StoresPage />, { signedIn: true, replies: [{ status, body: {} }] });
    expect(await screen.findByText('Could not load stores')).toBeInTheDocument();
    expect(screen.queryByText('No stores yet')).not.toBeInTheDocument();
  });
});

describe('GeographyPage', () => {
  it('shows the organisation units by region and runs a DHIS2 sync', async () => {
    const user = userEvent.setup();
    const { requests } = renderApp(<GeographyPage />, {
      signedIn: true,
      replies: [
        (request: RecordedRequest) =>
          request.method === 'POST'
            ? ok({ synced_at: '2026-11-20T09:00:00Z', changes: 0 })
            : ok(geography),
      ],
    });

    expect(await screen.findByText('Central region')).toBeInTheDocument();
    expect(screen.getByText('Katabi TC')).toBeInTheDocument();
    expect(screen.getByText('2,184')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Sync now' }));
    await waitFor(() => {
      expect(requests.some((request) => request.method === 'POST')).toBe(true);
    });
    expect(requests.find((request) => request.method === 'POST')?.url).toBe('/geography/sync');
  });

  it('offers a sync when nothing has been brought in yet', async () => {
    renderApp(<GeographyPage />, {
      signedIn: true,
      replies: [
        ok({
          synced_at: null,
          counts: { regions: 0, districts: 0, subcounties: 0, facilities: 0 },
          regions: [],
        }),
      ],
    });
    expect(await screen.findByText('No organisation units yet')).toBeInTheDocument();
    expect(screen.getByText('Not synced yet')).toBeInTheDocument();
  });

  it('shows an error with a retry when the geography cannot be loaded', async () => {
    renderApp(<GeographyPage />, { signedIn: true, replies: [{ status: 500, body: {} }] });
    expect(await screen.findByRole('button', { name: /try again/i })).toBeInTheDocument();
  });
});
