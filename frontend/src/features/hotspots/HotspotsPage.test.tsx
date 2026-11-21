import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { Ref } from 'react';

import { DistrictContextProvider } from '@/features/district/DistrictContext';
import { renderApp, sessionWith } from '@/test/renderApp';

import HotspotMapPage from './HotspotMapPage';
import HotspotsPage from './HotspotsPage';
import type { HotspotMapHandle } from './map/HotspotMapCanvas';

// jsdom has no WebGL. The map itself is checked in a browser; these tests cover
// what loads, the list beside the map and the detail panel.
vi.mock('./map/HotspotMapCanvas', async () => {
  const { useImperativeHandle } = await import('react');
  return {
    default: function MapStub({ handleRef }: { handleRef?: Ref<HotspotMapHandle> }) {
      useImperativeHandle(
        handleRef,
        () => ({ fitTo: () => undefined, flyTo: () => undefined }),
        [],
      );
      return <div data-testid="hotspot-map" />;
    },
  };
});

const id = '6f1e2c50-9d8a-4f3b-8c1e-2b7a9d0c4e11';
const district = '7f2c3c5e-1d4b-4c1a-9a51-2a8f6f0b9e11';
const hotspot = (status: string, extra: object = {}) => ({
  id,
  name: 'Lake view bar',
  type: 'Bar',
  village: 'Seja',
  contact_person_name: 'Okello James',
  contact_person_telephone: '0772000000',
  has_condom_dispenser: true,
  dispenser_condition: 'Good',
  latitude: 0.3295,
  longitude: 32.6016,
  status,
  rejection_reason: null,
  district_id: district,
  ...extra,
});
const list = (...items: object[]) => ({ status: 200, body: { success: true, data: items } });
const submittedEvent = {
  id: 'a1b2c3d4-0000-4000-8000-000000000001',
  hot_spot_id: id,
  actor_id: 'a1b2c3d4-0000-4000-8000-000000000002',
  action: 'submitted',
  status: 'submitted',
  created_at: '2026-11-19T10:00:00Z',
};

describe('HotspotsPage review queue', () => {
  it('shows submissions and the district notification', async () => {
    renderApp(<HotspotsPage workspace="review" />, {
      signedIn: true,
      replies: [list(hotspot('submitted')), list(submittedEvent)],
    });

    const row = (await screen.findAllByText('Lake view bar'))
      .find((node) => node.closest('tr'))!
      .closest('tr')!;
    expect(within(row).getByText('submitted')).toBeInTheDocument();
    expect(within(row).getByText('Yes, good')).toBeInTheDocument();
    expect(await screen.findByText(/was submitted for verification/)).toBeInTheDocument();
  });

  it('verifies a submitted hotspot', async () => {
    const user = userEvent.setup();
    const { requests } = renderApp(<HotspotsPage workspace="review" />, {
      signedIn: true,
      replies: [
        list(hotspot('submitted')),
        list(),
        { status: 200, body: { success: true } },
        list(hotspot('verified')),
        list(),
      ],
    });

    await user.click(await screen.findByRole('button', { name: 'Actions for Lake view bar' }));
    expect(screen.queryByRole('menuitem', { name: 'Activate' })).not.toBeInTheDocument();
    await user.click(await screen.findByRole('menuitem', { name: 'Verify' }));

    await waitFor(() => {
      expect(requests.find((request) => request.method === 'POST')).toMatchObject({
        url: `/hotspots/${id}/actions/verify`,
      });
    });
  });

  it('rejects a hotspot with a reason', async () => {
    const user = userEvent.setup();
    const { requests } = renderApp(<HotspotsPage workspace="review" />, {
      signedIn: true,
      replies: [
        list(hotspot('verified')),
        list(),
        { status: 200, body: { success: true } },
        list(),
        list(),
      ],
    });

    await user.click(await screen.findByRole('button', { name: 'Actions for Lake view bar' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Reject' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Reject hotspot' }));
    expect(await within(dialog).findByText('Say why the hotspot is rejected.')).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText(/Reason/), 'Already mapped');
    await user.click(within(dialog).getByRole('button', { name: 'Reject hotspot' }));

    await waitFor(() => {
      expect(requests.find((request) => request.method === 'POST')).toMatchObject({
        url: `/hotspots/${id}/actions/reject`,
        body: { reason: 'Already mapped' },
      });
    });
  });
});

describe('HotspotsPage for a VHT', () => {
  it('shows why a submission was rejected and has no review actions', async () => {
    renderApp(<HotspotsPage workspace="submit" />, {
      signedIn: true,
      replies: [list(hotspot('rejected', { rejection_reason: 'Already mapped' })), list()],
    });

    expect(await screen.findByText('Already mapped')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Actions for/ })).not.toBeInTheDocument();
  });

  it('submits a new hotspot to the chosen district', async () => {
    const user = userEvent.setup();
    const { requests } = renderApp(<HotspotsPage workspace="submit" />, {
      signedIn: true,
      replies: [
        list(),
        list(),
        list({ id: district, name: 'Buvuma' }),
        { status: 201, body: { success: true } },
        list(hotspot('submitted')),
      ],
    });

    await user.click((await screen.findAllByRole('button', { name: 'Submit hotspot' }))[0]!);
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Hotspot name/), 'Lake view bar');
    await user.click(within(dialog).getByRole('combobox', { name: /District/ }));
    await user.click(await screen.findByRole('option', { name: 'Buvuma' }));
    await user.click(within(dialog).getByRole('button', { name: 'Submit hotspot' }));

    await waitFor(() => {
      expect(requests.find((request) => request.method === 'POST')).toMatchObject({
        url: '/hotspots',
        body: { name: 'Lake view bar', district_id: district, has_condom_dispenser: null },
      });
    });
  });
});

describe('HotspotMapPage', () => {
  const gulu = '0d6c4b1e-5a3f-4e2b-8c7d-9f1a2b3c4d5e';
  const goHotspot = (fields: object = {}) => ({
    id,
    name: 'Lake view bar',
    type: 'Bar',
    village: 'Seja',
    region: { id: 'r1', name: 'Central' },
    district: { id: district, name: 'Wakiso' },
    subcounty: null,
    latitude: 0.3295,
    longitude: 32.6016,
    has_condom_dispenser: true,
    dispenser_condition: 'Good',
    status: 'active',
    review_status: 'active',
    contact_person: { id: 'c1', name: 'Okello James', phone_number: '+256772000000' },
    created_at: '2026-01-02T10:00:00Z',
    updated_at: '2026-02-03T10:00:00Z',
    ...fields,
  });
  const unplaced = goHotspot({
    id: '9a9a9a9a-0000-4000-8000-000000000009',
    name: 'Nowhere lodge',
    latitude: null,
    longitude: null,
  });
  const api =
    (hotspots: object[] = [goHotspot()]) =>
    (request: { url: string }) => {
      if (request.url === '/locations/districts')
        return list({ id: district, name: 'Wakiso' }, { id: gulu, name: 'Gulu' });
      if (request.url === '/locations/regions') return list({ id: 'r1', name: 'Central' });
      if (request.url.startsWith('/hotspots?')) {
        const query = new URLSearchParams(request.url.split('?')[1]);
        const inDistrict = query.get('district_id') !== gulu;
        return list(...(query.get('offset') === '0' && inDistrict ? hotspots : []));
      }
      if (request.url.endsWith('/events')) return list(submittedEvent);
      if (request.url.startsWith('/hotspots/'))
        return { status: 200, body: { success: true, data: { ...goHotspot(), comments: [] } } };
      return list();
    };
  const hotspotUrls = (requests: { url: string }[]) =>
    requests.map(({ url }) => url).filter((url) => url.startsWith('/hotspots?'));

  it('loads the whole country a district at a time for a national user', async () => {
    const { requests } = renderApp(<HotspotMapPage canSwitchDistrict />, {
      route: '/moh/hotspot-map',
      signedIn: true,
      replies: [api()],
    });

    expect(await screen.findByRole('button', { name: /Lake view bar/ })).toBeInTheDocument();
    expect(hotspotUrls(requests)).toEqual(
      expect.arrayContaining([
        `/hotspots?limit=100&offset=0&district_id=${district}`,
        `/hotspots?limit=100&offset=0&district_id=${gulu}`,
      ]),
    );
    expect(screen.getByText('1 of 1 hotspot is on the map.')).toBeInTheDocument();
  });

  it('loads only the district chosen in the top bar', async () => {
    const { requests } = renderApp(
      <DistrictContextProvider>
        <HotspotMapPage canSwitchDistrict />
      </DistrictContextProvider>,
      {
        route: '/moh/hotspot-map?district=Wakiso',
        signedIn: true,
        replies: [api()],
      },
    );

    expect(await screen.findByRole('button', { name: /Lake view bar/ })).toBeInTheDocument();
    const urls = hotspotUrls(requests);
    expect(urls).toContain(`/hotspots?limit=100&offset=0&district_id=${district}`);
    expect(urls.some((url) => url.includes(gulu))).toBe(false);
  });

  it('shows a DCFP what the API scopes them to, without a district filter', async () => {
    const { requests } = renderApp(<HotspotMapPage />, {
      route: '/dcfp/hotspot-map',
      session: sessionWith(['hotspots:read', 'hotspots:activate'], ['dfcp']),
      replies: [api()],
    });

    expect(await screen.findByRole('button', { name: /Lake view bar/ })).toBeInTheDocument();
    expect(hotspotUrls(requests)).toContain('/hotspots?limit=100&offset=0');
    expect(hotspotUrls(requests).some((url) => url.includes('district_id'))).toBe(false);
    expect(requests.some(({ url }) => url === '/locations/districts')).toBe(false);
  });

  it('opens a hotspot from the list with its contact and history', async () => {
    const user = userEvent.setup();
    const { requests } = renderApp(<HotspotMapPage canSwitchDistrict />, {
      route: '/moh/hotspot-map',
      signedIn: true,
      replies: [api()],
    });

    await user.click(await screen.findByRole('button', { name: /Lake view bar/ }));

    const heading = await screen.findByRole('heading', { level: 2, name: 'Lake view bar' });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(screen.getByRole('link', { name: 'Call' })).toHaveAttribute('href', 'tel:+256772000000');
    expect(await screen.findByText('Submitted for review')).toBeInTheDocument();
    expect(requests.map(({ url }) => url)).toEqual(
      expect.arrayContaining([`/hotspots/${id}`, `/hotspots/${id}/events`]),
    );

    await user.click(screen.getByRole('button', { name: 'Back to list' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'In view' })).toHaveFocus();
  });

  it('lists the hotspots that have no position, so they can be fixed', async () => {
    const user = userEvent.setup();
    renderApp(<HotspotMapPage canSwitchDistrict />, {
      route: '/moh/hotspot-map',
      signedIn: true,
      replies: [api([goHotspot(), unplaced])],
    });

    expect(
      await screen.findByText('1 of 2 hotspots are on the map. 1 has no position recorded.'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'List the 1 without a position' }));

    expect(
      screen.getByRole('heading', { level: 2, name: 'Without a position' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Nowhere lodge/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Lake view bar/ })).not.toBeInTheDocument();
  });

  it('narrows the list by search and by status', async () => {
    const user = userEvent.setup();
    renderApp(<HotspotMapPage canSwitchDistrict />, {
      route: '/moh/hotspot-map',
      signedIn: true,
      replies: [api([goHotspot(), unplaced])],
    });

    await user.type(
      await screen.findByLabelText('Search hotspots by name, place or contact'),
      'nowhere',
    );
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Search results' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Nowhere lodge/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Lake view bar/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Clear' }));
    await user.click(screen.getByRole('button', { name: 'Status: all shown' }));
    await user.click(await screen.findByRole('menuitemcheckbox', { name: /Active/ }));
    await user.keyboard('{Escape}');

    expect(await screen.findByText('No hotspots match')).toBeInTheDocument();
  });
});
