import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { renderApp } from '@/test/renderApp';

import HotspotMapPage from './HotspotMapPage';
import HotspotsPage from './HotspotsPage';

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
  it('explains what to configure when no maps key is set, instead of a broken map', async () => {
    renderApp(<HotspotMapPage />, { signedIn: true, replies: [list(hotspot('active'))] });

    expect(await screen.findByText('The map is not set up')).toBeInTheDocument();
    expect(screen.getByText(/NEXT_PUBLIC_GOOGLE_MAPS_API_KEY/)).toBeInTheDocument();
  });
});
