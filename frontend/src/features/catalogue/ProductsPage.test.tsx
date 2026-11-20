import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { RecordedRequest } from '@/test/fakeAdapter';
import { renderApp } from '@/test/renderApp';

import ProductsPage from './ProductsPage';
import UnitsPage from './UnitsPage';

const units = [
  { id: 'unit-piece', name: 'Piece', note: 'A single condom', product_count: 2 },
  { id: 'unit-box', name: 'Box', note: null, product_count: 0 },
];
const products = [
  {
    id: 'CND-001',
    category: 'male',
    brand: 'Engabu',
    type: 'Standard',
    unit: { id: 'unit-piece', name: 'Piece' },
    pieces_per_unit: 1,
    minimum_level: 5000,
    active: true,
  },
  {
    id: 'CND-004',
    category: 'female',
    brand: 'FC2',
    type: 'Standard',
    unit: { id: 'unit-piece', name: 'Piece' },
    pieces_per_unit: 1,
    minimum_level: null,
    active: false,
  },
];

interface Reply {
  status: number;
  body?: unknown;
}

function api(write: (request: RecordedRequest) => Reply = () => ({ status: 200, body: {} })) {
  return (request: RecordedRequest): Reply => {
    if (request.method !== 'GET') return write(request);
    if (request.url === '/catalogue/units')
      return { status: 200, body: { success: true, data: units } };
    return { status: 200, body: { success: true, data: products } };
  };
}

const writes = (requests: RecordedRequest[]) =>
  requests.filter((request) => request.method !== 'GET');

describe('ProductsPage', () => {
  it('lists the products, marked as sample data', async () => {
    renderApp(<ProductsPage />, { signedIn: true, replies: [api()] });

    const row = (await screen.findByText('Engabu · Standard')).closest('tr');
    if (!row) throw new Error('Engabu has no table row');
    expect(within(row).getByText('5,000')).toBeInTheDocument();
    expect(within(row).getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Sample data')).toBeInTheDocument();
  });

  it('checks the product form before sending it', async () => {
    const user = userEvent.setup();
    const { requests } = renderApp(<ProductsPage />, { signedIn: true, replies: [api()] });
    await screen.findByText('Engabu · Standard');

    await user.click(screen.getByRole('button', { name: 'Add product' }));
    const dialog = await screen.findByRole('dialog');
    await user.clear(within(dialog).getByLabelText('Condoms per unit'));
    await user.type(within(dialog).getByLabelText('Condoms per unit'), '1.5');
    await user.click(within(dialog).getByRole('button', { name: 'Add product' }));

    expect(await within(dialog).findByText('Enter the brand, e.g. Engabu.')).toBeInTheDocument();
    expect(within(dialog).getByText('Choose a unit of measure.')).toBeInTheDocument();
    expect(
      within(dialog).getByText('Use a whole number, with no decimals or symbols.'),
    ).toBeInTheDocument();
    expect(writes(requests)).toEqual([]);
  });

  it('adds a product, sending numbers as numbers and a blank minimum as null', async () => {
    const user = userEvent.setup();
    const { requests } = renderApp(<ProductsPage />, {
      signedIn: true,
      replies: [
        api(() => ({
          status: 201,
          body: { success: true, data: { ...products[0], id: 'CND-007' } },
        })),
      ],
    });
    await screen.findByText('Engabu · Standard');

    await user.click(screen.getByRole('button', { name: 'Add product' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Brand'), 'Engabu');
    await user.type(within(dialog).getByLabelText('Type'), 'Studded');
    await user.click(within(dialog).getByRole('combobox', { name: 'Unit of measure' }));
    await user.click(await screen.findByRole('option', { name: 'Box' }));
    await user.clear(within(dialog).getByLabelText('Condoms per unit'));
    await user.type(within(dialog).getByLabelText('Condoms per unit'), '144');
    await user.click(within(dialog).getByRole('button', { name: 'Add product' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(writes(requests)).toEqual([
      expect.objectContaining({
        method: 'POST',
        url: '/catalogue/products',
        body: {
          category: 'male',
          brand: 'Engabu',
          type: 'Studded',
          unit_id: 'unit-box',
          pieces_per_unit: 144,
          minimum_level: null,
        },
      }),
    ]);
  });

  it('shows a server validation message beside its field', async () => {
    const user = userEvent.setup();
    renderApp(<ProductsPage />, {
      signedIn: true,
      replies: [
        api(() => ({
          status: 422,
          body: {
            success: false,
            message: 'validation failed',
            error: { brand: 'Enter a brand of at most 60 characters.' },
          },
        })),
      ],
    });
    await screen.findByText('Engabu · Standard');

    await user.click(screen.getByRole('button', { name: 'Add product' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Brand'), 'Engabu');
    await user.type(within(dialog).getByLabelText('Type'), 'Studded');
    await user.click(within(dialog).getByRole('combobox', { name: 'Unit of measure' }));
    await user.click(await screen.findByRole('option', { name: 'Piece' }));
    await user.click(within(dialog).getByRole('button', { name: 'Add product' }));

    expect(
      await within(dialog).findByText('Enter a brand of at most 60 characters.'),
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Brand')).toHaveAttribute('aria-invalid', 'true');
  });

  it('deactivates a product from its row', async () => {
    const user = userEvent.setup();
    const { requests } = renderApp(<ProductsPage />, {
      signedIn: true,
      replies: [
        api(() => ({
          status: 200,
          body: { success: true, data: { ...products[0], active: false } },
        })),
      ],
    });
    await screen.findByText('Engabu · Standard');

    await user.click(screen.getByRole('button', { name: 'Actions for CND-001' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Deactivate' }));

    await waitFor(() => {
      expect(writes(requests)).toEqual([
        expect.objectContaining({
          method: 'PATCH',
          url: '/catalogue/products/CND-001',
          body: { active: false },
        }),
      ]);
    });
  });
});

describe('UnitsPage', () => {
  it('adds a unit and clears the form', async () => {
    const user = userEvent.setup();
    const { requests } = renderApp(<UnitsPage />, {
      signedIn: true,
      replies: [
        api(() => ({
          status: 201,
          body: {
            success: true,
            data: { id: 'unit-9', name: 'Dispenser pack', note: null, product_count: 0 },
          },
        })),
      ],
    });
    await screen.findByText('Piece');

    await user.type(screen.getByLabelText('Unit name'), ' Dispenser pack ');
    await user.click(screen.getByRole('button', { name: 'Add unit' }));

    await waitFor(() => {
      expect(screen.getByLabelText('Unit name')).toHaveValue('');
    });
    expect(writes(requests)).toEqual([
      expect.objectContaining({
        method: 'POST',
        url: '/catalogue/units',
        body: { name: 'Dispenser pack', note: null },
      }),
    ]);
  });

  it('puts a duplicate name beside the name field and keeps what was typed', async () => {
    const user = userEvent.setup();
    renderApp(<UnitsPage />, {
      signedIn: true,
      replies: [
        api(() => ({
          status: 409,
          body: {
            success: false,
            message: 'A unit with this name already exists.',
            error: { name: 'A unit with this name already exists.' },
          },
        })),
      ],
    });
    await screen.findByText('Piece');

    await user.type(screen.getByLabelText('Unit name'), 'box');
    await user.click(screen.getByRole('button', { name: 'Add unit' }));

    expect(await screen.findByText('A unit with this name already exists.')).toBeInTheDocument();
    expect(screen.getByLabelText('Unit name')).toHaveValue('box');
  });

  it('rejects a one-letter name without asking the server', async () => {
    const user = userEvent.setup();
    const { requests } = renderApp(<UnitsPage />, { signedIn: true, replies: [api()] });
    await screen.findByText('Piece');

    await user.type(screen.getByLabelText('Unit name'), 'x');
    await user.click(screen.getByRole('button', { name: 'Add unit' }));

    expect(await screen.findByText('Use at least 2 characters.')).toBeInTheDocument();
    expect(writes(requests)).toEqual([]);
  });
});
