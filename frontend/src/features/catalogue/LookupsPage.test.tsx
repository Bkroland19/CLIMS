import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { RecordedRequest } from '@/test/fakeAdapter';
import { renderApp } from '@/test/renderApp';

import BrandsPage from './BrandsPage';
import UnitsPage from './UnitsPage';

const STAMP = { created_at: '2026-01-05T08:00:00Z', updated_at: '2026-02-01T08:00:00Z' };
const lookup = (id: string, name: string, note: string | null, product_count: number) => ({
  id,
  name,
  note,
  active: true,
  in_use: product_count > 0,
  product_count,
  ...STAMP,
});

const brands = [
  lookup('b-engabu', 'Engabu', 'Free public-sector brand', 3),
  lookup('b-kiss', 'Kiss', null, 0),
];
const units = [lookup('u-piece', 'Piece', 'A single condom', 2), lookup('u-box', 'Box', null, 0)];

interface Reply {
  status: number;
  body?: unknown;
}

function api(write: (request: RecordedRequest) => Reply = () => ({ status: 200, body: {} })) {
  return (request: RecordedRequest): Reply => {
    if (request.method !== 'GET') return write(request);
    return {
      status: 200,
      body: { success: true, data: request.url === '/catalogue/brands' ? brands : units },
    };
  };
}

const writes = (requests: RecordedRequest[]) =>
  requests.filter((request) => request.method !== 'GET');

describe('BrandsPage', () => {
  it('lists brands with how many products use each', async () => {
    renderApp(<BrandsPage />, { signedIn: true, replies: [api()] });

    const row = (await screen.findByText('Engabu')).closest('tr');
    if (!row) throw new Error('Engabu has no table row');
    expect(within(row).getByText('3 products')).toBeInTheDocument();
    expect(within(row).getByText('Free public-sector brand')).toBeInTheDocument();
  });

  it('adds a brand, sending a blank note as null', async () => {
    const user = userEvent.setup();
    const { requests } = renderApp(<BrandsPage />, {
      signedIn: true,
      replies: [
        api(() => ({
          status: 201,
          body: { success: true, data: lookup('b-new', 'Lifeguard', null, 0) },
        })),
      ],
    });
    await screen.findByText('Engabu');

    await user.click(screen.getByRole('button', { name: 'Add brand' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add a brand' });
    await user.type(within(dialog).getByLabelText('Brand name'), ' Lifeguard ');
    await user.click(within(dialog).getByRole('button', { name: 'Add brand' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(writes(requests)).toEqual([
      expect.objectContaining({
        method: 'POST',
        url: '/catalogue/brands',
        body: { name: 'Lifeguard', note: null },
      }),
    ]);
  });

  it('edits a brand, clearing its note', async () => {
    const user = userEvent.setup();
    const { requests } = renderApp(<BrandsPage />, {
      signedIn: true,
      replies: [
        api(() => ({
          status: 200,
          body: { success: true, data: lookup('b-engabu', 'Engabu', null, 3) },
        })),
      ],
    });

    await user.click(await screen.findByRole('button', { name: 'Actions for Engabu' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit Engabu' });
    await user.clear(within(dialog).getByLabelText(/^Note/));
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(writes(requests)).toEqual([
        expect.objectContaining({
          method: 'PATCH',
          url: '/catalogue/brands/b-engabu',
          body: { name: 'Engabu', note: '' },
        }),
      ]);
    });
  });

  it('offers delete only for brands no product uses', async () => {
    const user = userEvent.setup();
    renderApp(<BrandsPage />, { signedIn: true, replies: [api()] });

    await user.click(await screen.findByRole('button', { name: 'Actions for Engabu' }));
    expect(await screen.findByRole('menuitem', { name: 'Deactivate' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Delete' })).not.toBeInTheDocument();
    await user.keyboard('{Escape}');

    await user.click(screen.getByRole('button', { name: 'Actions for Kiss' }));
    expect(await screen.findByRole('menuitem', { name: 'Delete' })).toBeInTheDocument();
  });
});

describe('UnitsPage', () => {
  it('puts a duplicate name beside the name field and keeps what was typed', async () => {
    const user = userEvent.setup();
    renderApp(<UnitsPage />, {
      signedIn: true,
      replies: [
        api(() => ({
          status: 409,
          body: {
            success: false,
            message: 'A unit of measure with this name already exists.',
            error: { name: 'A unit of measure with this name already exists.' },
          },
        })),
      ],
    });
    await screen.findByText('Piece');

    await user.click(screen.getByRole('button', { name: 'Add unit' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Unit name'), 'box');
    await user.click(within(dialog).getByRole('button', { name: 'Add unit' }));

    expect(
      await within(dialog).findByText('A unit of measure with this name already exists.'),
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Unit name')).toHaveValue('box');
  });

  it('rejects a one-letter name without asking the server', async () => {
    const user = userEvent.setup();
    const { requests } = renderApp(<UnitsPage />, { signedIn: true, replies: [api()] });
    await screen.findByText('Piece');

    await user.click(screen.getByRole('button', { name: 'Add unit' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Unit name'), 'x');
    await user.click(within(dialog).getByRole('button', { name: 'Add unit' }));

    expect(await within(dialog).findByText('Use at least 2 characters.')).toBeInTheDocument();
    expect(writes(requests)).toEqual([]);
  });
});
