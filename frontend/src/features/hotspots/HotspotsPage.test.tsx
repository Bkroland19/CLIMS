import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { FakeReply } from '@/test/fakeAdapter';
import { renderApp } from '@/test/renderApp';

import HotspotMapPage from './HotspotMapPage';
import HotspotsPage from './HotspotsPage';

const id = '6f1e2c50-9d8a-4f3b-8c1e-2b7a9d0c4e11';
const region = '1a2b3c4d-0000-4000-8000-0000000000aa';
const district = '7f2c3c5e-1d4b-4c1a-9a51-2a8f6f0b9e11';
const subcounty = '2b3c4d5e-0000-4000-8000-0000000000bb';
const hotspot = (reviewStatus: string, extra: object = {}) => ({
  id,
  name: 'Lake view bar',
  type: 'Bar',
  village: 'Seja',
  region: { id: region, name: 'Central' },
  district: { id: district, name: 'Buvuma' },
  subcounty: { id: subcounty, name: 'Nairambi' },
  latitude: 0.3295,
  longitude: 32.6016,
  has_condom_dispenser: true,
  dispenser_condition: 'Good',
  status: reviewStatus === 'active' ? 'active' : 'inactive',
  review_status: reviewStatus,
  submitted_by_id: 'a1b2c3d4-0000-4000-8000-000000000003',
  contact_person: {
    id: 'a1b2c3d4-0000-4000-8000-000000000004',
    name: 'Okello James',
    phone_number: '+256772000000',
  },
  created_at: '2026-11-19T10:00:00Z',
  updated_at: '2026-11-19T10:00:00Z',
  ...extra,
});
const list = (...items: object[]) => ({ status: 200, body: { success: true, data: items } });
const done = { status: 200, body: { success: true } };

/**
 * Replies for the DCFP's review queue, by address: it reads every page of the
 * district's hotspots and their supply figures at once, so the order its
 * requests go out in is not fixed. `write` answers the decision.
 */
/** A reply the router hands back: a fixed one, not another router. */
type Reply = Exclude<FakeReply, (request: never) => unknown>;

function reviewApi(hotspots: object[], write: Reply = done) {
  return (request: { method: string; url: string }): Reply => {
    if (request.method === 'POST') return write;
    // Only the first page holds anything: the list is shorter than a page.
    if (request.url.startsWith('/hotspots?')) {
      return request.url.includes('offset=0') ? list(...hotspots) : list();
    }
    return list();
  };
}

function rowOf(name: string) {
  const cell = screen.getAllByText(name).find((node) => node.closest('tr'));
  const row = cell?.closest('tr');
  if (!row) throw new Error(`No table row for ${name}`);
  return row;
}

describe('HotspotsPage review queue', () => {
  it('shows submissions and their manager', async () => {
    renderApp(<HotspotsPage workspace="review" />, {
      signedIn: true,
      replies: [reviewApi([hotspot('submitted')])],
    });

    await screen.findAllByText('Lake view bar');
    const row = rowOf('Lake view bar');
    expect(within(row).getByText('submitted')).toBeInTheDocument();
    expect(within(row).getByText('Okello James')).toBeInTheDocument();
    expect(within(row).getByText('Yes, good')).toBeInTheDocument();
  });

  it('offers activate and reject for a submission, deactivate for an active hotspot', async () => {
    const user = userEvent.setup();
    renderApp(<HotspotsPage workspace="review" />, {
      signedIn: true,
      replies: [
        reviewApi([hotspot('submitted'), hotspot('active', { id: 'other', name: 'Pier' })]),
      ],
    });

    await user.click(await screen.findByRole('button', { name: 'Actions for Lake view bar' }));
    expect(await screen.findByRole('menuitem', { name: 'Activate' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Reject' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Deactivate' })).not.toBeInTheDocument();
    await user.keyboard('{Escape}');

    await user.click(screen.getByRole('button', { name: 'Actions for Pier' }));
    expect(await screen.findByRole('menuitem', { name: 'Deactivate' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Activate' })).not.toBeInTheDocument();
  });

  it('activates a hotspot only with a comment', async () => {
    const user = userEvent.setup();
    const { requests } = renderApp(<HotspotsPage workspace="review" />, {
      signedIn: true,
      replies: [reviewApi([hotspot('submitted')])],
    });

    await user.click(await screen.findByRole('button', { name: 'Actions for Lake view bar' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Activate' }));
    const dialog = await screen.findByRole('dialog', { name: 'Activate Lake view bar?' });
    await user.click(within(dialog).getByRole('button', { name: 'Activate hotspot' }));
    expect(await within(dialog).findByText(/Add a comment/)).toBeInTheDocument();
    expect(requests.some((request) => request.method === 'POST')).toBe(false);

    await user.type(within(dialog).getByLabelText(/Comment/), 'Visited and confirmed');
    await user.click(within(dialog).getByRole('button', { name: 'Activate hotspot' }));

    await waitFor(() => {
      expect(requests.find((request) => request.method === 'POST')).toMatchObject({
        url: `/hotspots/${id}/activate`,
        body: { comment: 'Visited and confirmed' },
      });
    });
  });

  it('keeps the comment and shows the refusal when the decision is no longer allowed', async () => {
    const user = userEvent.setup();
    renderApp(<HotspotsPage workspace="review" />, {
      signedIn: true,
      replies: [
        reviewApi([hotspot('submitted')], {
          status: 409,
          body: { success: false, message: 'Hotspot was already rejected.' },
        }),
      ],
    });

    await user.click(await screen.findByRole('button', { name: 'Actions for Lake view bar' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Reject' }));
    const dialog = await screen.findByRole('dialog', { name: 'Reject Lake view bar?' });
    await user.type(within(dialog).getByLabelText(/Comment/), 'Already mapped');
    await user.click(within(dialog).getByRole('button', { name: 'Reject hotspot' }));

    expect(await within(dialog).findByText('Hotspot was already rejected.')).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/Comment/)).toHaveValue('Already mapped');
  });
});

describe('HotspotsPage for a VHT', () => {
  it('shows a rejected submission without review actions', async () => {
    renderApp(<HotspotsPage workspace="submit" />, {
      signedIn: true,
      replies: [list(hotspot('rejected')), list()],
    });

    await screen.findAllByText('Lake view bar');
    expect(within(rowOf('Lake view bar')).getByText('rejected')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Actions for/ })).not.toBeInTheDocument();
  });

  it('submits a new hotspot with its region, district and subcounty', async () => {
    const user = userEvent.setup();
    const { requests } = renderApp(<HotspotsPage workspace="submit" />, {
      signedIn: true,
      replies: [
        (request) => {
          if (request.url === '/locations/regions') return list({ id: region, name: 'Central' });
          if (request.url.startsWith('/locations/districts'))
            return list({ id: district, name: 'Buvuma' });
          if (request.url.startsWith('/locations/subcounties'))
            return list({ id: subcounty, name: 'Nairambi' });
          if (request.method === 'POST') return { status: 201, body: { success: true } };
          return list();
        },
      ],
    });

    await user.click((await screen.findAllByRole('button', { name: 'Submit hotspot' }))[0]!);
    const dialog = await screen.findByRole('dialog');
    const pick = async (label: RegExp, option: string) => {
      const select = within(dialog).getByRole('combobox', { name: label });
      await waitFor(() => expect(select).toBeEnabled());
      await user.click(select);
      await user.click(await screen.findByRole('option', { name: option }));
    };
    await user.type(within(dialog).getByLabelText(/Hotspot name/), 'Lake view bar');
    await user.type(within(dialog).getByLabelText(/Type of place/), 'Bar');
    await pick(/Region/, 'Central');
    await pick(/District/, 'Buvuma');
    await pick(/Subcounty/, 'Nairambi');
    await user.type(within(dialog).getByLabelText(/Hotspot manager/), 'Okello James');
    await user.type(within(dialog).getByLabelText(/Manager's phone/), '0772 000 000');
    await pick(/Condom dispenser/, 'No');
    await user.type(within(dialog).getByLabelText(/Latitude/), '0.33');
    await user.type(within(dialog).getByLabelText(/Longitude/), '32.6');
    await user.click(within(dialog).getByRole('button', { name: 'Submit hotspot' }));

    await waitFor(() => {
      expect(requests.find((request) => request.method === 'POST')).toMatchObject({
        url: '/hotspots',
        body: {
          name: 'Lake view bar',
          type: 'Bar',
          region_id: region,
          district_id: district,
          subcounty_id: subcounty,
          contact_person_name: 'Okello James',
          contact_person_phone: '+256772000000',
          has_condom_dispenser: false,
          latitude: 0.33,
          longitude: 32.6,
        },
      });
    });
  });
});

describe('HotspotMapPage', () => {
  it('requests hotspots for the selected district in the MoH map', async () => {
    const user = userEvent.setup();
    const { requests } = renderApp(<HotspotMapPage canSwitchDistrict />, {
      route: '/moh/hotspot-map',
      signedIn: true,
      replies: [
        (request) =>
          request.url === '/locations/districts'
            ? list({ id: district, name: 'Wakiso' })
            : list(hotspot('active')),
      ],
    });

    const select = screen.getByRole('combobox', { name: 'District' });
    await waitFor(() => expect(select).toBeEnabled());
    await user.click(select);
    await user.click(await screen.findByRole('option', { name: 'Wakiso' }));

    await waitFor(() => {
      expect(requests).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ url: '/hotspots?limit=100' }),
          expect.objectContaining({ url: `/hotspots?limit=100&district_id=${district}` }),
        ]),
      );
    });
  });

  it('explains what to configure when no maps key is set, instead of a broken map', async () => {
    renderApp(<HotspotMapPage />, { signedIn: true, replies: [list(hotspot('active'))] });

    expect(await screen.findByText('The map is not set up')).toBeInTheDocument();
    expect(screen.getByText(/NEXT_PUBLIC_GOOGLE_MAPS_API_KEY/)).toBeInTheDocument();
  });
});
