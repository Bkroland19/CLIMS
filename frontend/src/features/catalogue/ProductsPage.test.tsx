import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { ReadOnlyProvider } from '@/navigation/useAccess';
import type { RecordedRequest } from '@/test/fakeAdapter';
import { renderApp, sessionWith } from '@/test/renderApp';

import ProductsPage from './ProductsPage';

const STAMP = { created_at: '2026-01-05T08:00:00Z', updated_at: '2026-02-01T08:00:00Z' };
const lookup = (id: string, name: string, active = true, product_count = 1) => ({
  id,
  name,
  note: null,
  active,
  in_use: product_count > 0,
  product_count,
  ...STAMP,
});

const brands = [
  lookup('b-engabu', 'Engabu'),
  lookup('b-fc2', 'FC2'),
  lookup('b-trust', 'Trust', false),
];
const units = [lookup('u-piece', 'Piece'), lookup('u-box', 'Box')];
const types = [
  lookup('t-free', 'Free'),
  lookup('t-social', 'Socially marketed', true, 0),
  lookup('t-commercial', 'Commercial'),
  lookup('t-donated', 'Donated', false, 0),
];
const FREE = { id: 't-free', name: 'Free' };

const engabu = {
  id: 'p-engabu',
  category: 'male',
  type: FREE,
  brand: { id: 'b-engabu', name: 'Engabu' },
  unit: { id: 'u-piece', name: 'Piece' },
  pieces_per_unit: 1,
  active: true,
  in_use: true,
  ...STAMP,
};
const fc2 = {
  id: 'p-fc2',
  category: 'female',
  type: FREE,
  brand: { id: 'b-fc2', name: 'FC2' },
  unit: { id: 'u-box', name: 'Box' },
  pieces_per_unit: 100,
  active: false,
  in_use: false,
  ...STAMP,
};
// Converted from the legacy system without a unit or pack size, then deactivated.
const legacy = {
  id: 'p-legacy',
  category: 'male',
  type: { id: 't-commercial', name: 'Commercial' },
  brand: { id: 'b-trust', name: 'Trust' },
  unit: null,
  pieces_per_unit: null,
  active: false,
  in_use: true,
  ...STAMP,
};
const products = [engabu, fc2, legacy];

interface Reply {
  status: number;
  body?: unknown;
}

function api(write: (request: RecordedRequest) => Reply = () => ({ status: 200, body: {} })) {
  return (request: RecordedRequest): Reply => {
    if (request.method !== 'GET') return write(request);
    if (request.url === '/catalogue/brands')
      return { status: 200, body: { success: true, data: brands } };
    if (request.url === '/catalogue/units')
      return { status: 200, body: { success: true, data: units } };
    if (request.url === '/catalogue/types')
      return { status: 200, body: { success: true, data: types } };
    return { status: 200, body: { success: true, data: products } };
  };
}

const writes = (requests: RecordedRequest[]) =>
  requests.filter((request) => request.method !== 'GET');

async function rowOf(text: string): Promise<HTMLElement> {
  const row = (await screen.findByText(text)).closest('tr');
  if (!row) throw new Error(`${text} has no table row`);
  return row;
}

async function openActions(user: ReturnType<typeof userEvent.setup>, name: RegExp) {
  await user.click(await screen.findByRole('button', { name }));
}

describe('ProductsPage', () => {
  it('lists the products with their status and flags incomplete legacy ones', async () => {
    renderApp(<ProductsPage />, { signedIn: true, replies: [api()] });

    const row = await rowOf('Engabu');
    expect(within(row).getByText('Free')).toBeInTheDocument();
    expect(within(row).getByText('Active')).toBeInTheDocument();
    const legacyRow = await rowOf('Trust');
    expect(within(legacyRow).getByText('Incomplete')).toBeInTheDocument();
    expect(within(legacyRow).getAllByText('—')).toHaveLength(2);
    expect(screen.getByText('1 product is missing details')).toBeInTheDocument();
    expect(screen.queryByText('Sample data')).not.toBeInTheDocument();
  });

  it('shows only the products the status filter keeps', async () => {
    renderApp(<ProductsPage />, {
      signedIn: true,
      route: '/moh/catalogue?status=inactive',
      replies: [api()],
    });

    await rowOf('FC2');
    expect(screen.getByText('Trust')).toBeInTheDocument();
    expect(screen.queryByText('Engabu')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Incomplete/ })).toBeInTheDocument();
  });

  it('checks the product form before sending it', async () => {
    const user = userEvent.setup();
    const { requests } = renderApp(<ProductsPage />, { signedIn: true, replies: [api()] });
    await rowOf('Engabu');

    await user.click(screen.getByRole('button', { name: 'Add product' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Condoms per unit'), '1.5');
    await user.click(within(dialog).getByRole('button', { name: 'Add product' }));

    expect(await within(dialog).findByText('Choose a brand.')).toBeInTheDocument();
    expect(within(dialog).getByText('Choose a type.')).toBeInTheDocument();
    expect(within(dialog).getByText('Choose a unit of measure.')).toBeInTheDocument();
    expect(
      within(dialog).getByText('Use a whole number, with no decimals or symbols.'),
    ).toBeInTheDocument();
    expect(writes(requests)).toEqual([]);
  });

  it('adds a product from active types, brands and units, sending numbers as numbers', async () => {
    const user = userEvent.setup();
    const { requests } = renderApp(<ProductsPage />, {
      signedIn: true,
      replies: [
        api(() => ({ status: 201, body: { success: true, data: { ...engabu, id: 'p-new' } } })),
      ],
    });
    await rowOf('Engabu');

    await user.click(screen.getByRole('button', { name: 'Add product' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('combobox', { name: 'Brand' }));
    expect(screen.queryByRole('option', { name: /Trust/ })).not.toBeInTheDocument();
    await user.click(await screen.findByRole('option', { name: 'Engabu' }));
    await user.click(within(dialog).getByRole('combobox', { name: 'Type' }));
    expect(screen.queryByRole('option', { name: /Donated/ })).not.toBeInTheDocument();
    await user.click(await screen.findByRole('option', { name: 'Socially marketed' }));
    await user.click(within(dialog).getByRole('combobox', { name: 'Unit of measure' }));
    await user.click(await screen.findByRole('option', { name: 'Box' }));
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
          type_id: 't-social',
          brand_id: 'b-engabu',
          unit_id: 'u-box',
          pieces_per_unit: 144,
        },
      }),
    ]);
  });

  it('edits a product and puts a server message beside its field', async () => {
    const user = userEvent.setup();
    const { requests } = renderApp(<ProductsPage />, {
      signedIn: true,
      replies: [
        api(() => ({
          status: 422,
          body: {
            success: false,
            message: 'validation failed',
            error: { unit_id: 'This unit of measure is inactive. Choose an active unit.' },
          },
        })),
      ],
    });

    await openActions(user, /^Actions for Engabu/);
    await user.click(await screen.findByRole('menuitem', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog', { name: /Edit Engabu/ });
    expect(within(dialog).getByLabelText('Condoms per unit')).toHaveValue('1');
    await user.clear(within(dialog).getByLabelText('Condoms per unit'));
    await user.type(within(dialog).getByLabelText('Condoms per unit'), '3');
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    expect(
      await within(dialog).findByText('This unit of measure is inactive. Choose an active unit.'),
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Condoms per unit')).toHaveValue('3');
    expect(writes(requests)).toEqual([
      expect.objectContaining({
        method: 'PATCH',
        url: '/catalogue/products/p-engabu',
        body: {
          category: 'male',
          type_id: 't-free',
          brand_id: 'b-engabu',
          unit_id: 'u-piece',
          pieces_per_unit: 3,
        },
      }),
    ]);
  });

  it('deactivates a product from its row', async () => {
    const user = userEvent.setup();
    const { requests } = renderApp(<ProductsPage />, {
      signedIn: true,
      replies: [
        api(() => ({ status: 200, body: { success: true, data: { ...engabu, active: false } } })),
      ],
    });

    await openActions(user, /^Actions for Engabu/);
    await user.click(await screen.findByRole('menuitem', { name: 'Deactivate' }));

    await waitFor(() => {
      expect(writes(requests)).toEqual([
        expect.objectContaining({
          method: 'PATCH',
          url: '/catalogue/products/p-engabu',
          body: { active: false },
        }),
      ]);
    });
  });

  it('asks for the missing details of an incomplete product instead of activating it', async () => {
    const user = userEvent.setup();
    renderApp(<ProductsPage />, { signedIn: true, replies: [api()] });

    await openActions(user, /^Actions for Trust/);
    expect(await screen.findByRole('menuitem', { name: 'Complete details' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Activate' })).not.toBeInTheDocument();
    // Legacy stock still refers to it, so it cannot be deleted.
    expect(screen.queryByRole('menuitem', { name: 'Delete' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('menuitem', { name: 'Complete details' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/without all its details/)).toBeInTheDocument();
    expect(within(dialog).getByRole('combobox', { name: 'Brand' })).toHaveTextContent(
      'Trust (inactive)',
    );
  });

  it('confirms before deleting, and shows a refusal inside the confirmation', async () => {
    const user = userEvent.setup();
    const { requests } = renderApp(<ProductsPage />, {
      signedIn: true,
      replies: [
        api(() => ({
          status: 409,
          body: {
            success: false,
            message: 'This product is used by stock or order records. Deactivate it instead.',
          },
        })),
      ],
    });

    await openActions(user, /^Actions for FC2/);
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    const confirm = await screen.findByRole('alertdialog', {
      name: 'Delete FC2 · Female · Free?',
    });
    await user.click(within(confirm).getByRole('button', { name: 'Delete product' }));

    expect(
      await within(confirm).findByText(
        'This product is used by stock or order records. Deactivate it instead.',
      ),
    ).toBeInTheDocument();
    expect(writes(requests)).toEqual([
      expect.objectContaining({ method: 'DELETE', url: '/catalogue/products/p-fc2' }),
    ]);
  });

  it('leaves out every change for people without catalogue:manage', async () => {
    renderApp(<ProductsPage />, { session: sessionWith(['users:read']), replies: [api()] });

    await rowOf('Engabu');
    expect(screen.queryByRole('button', { name: 'Add product' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Actions for/ })).not.toBeInTheDocument();
    expect(screen.queryByText('1 product is missing details')).not.toBeInTheDocument();
  });

  it('leaves out every change in a workspace opened read-only, even with catalogue:manage', async () => {
    renderApp(
      <ReadOnlyProvider value={true}>
        <ProductsPage />
      </ReadOnlyProvider>,
      { signedIn: true, replies: [api()] },
    );

    await rowOf('Engabu');
    expect(screen.queryByRole('button', { name: 'Add product' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Actions for/ })).not.toBeInTheDocument();
  });

  it('keeps the filter links on the page it is shown on', async () => {
    renderApp(<ProductsPage />, {
      signedIn: true,
      route: '/warehouse/catalogue',
      replies: [api()],
    });

    await rowOf('Engabu');
    expect(screen.getByRole('link', { name: /Inactive/ })).toHaveAttribute(
      'href',
      '/warehouse/catalogue?status=inactive',
    );
  });
});
