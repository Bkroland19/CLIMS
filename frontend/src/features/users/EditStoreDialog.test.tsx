import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { RecordedRequest } from '@/test/fakeAdapter';
import { renderApp } from '@/test/renderApp';

import type { User } from './api';
import { EditStoreDialog } from './EditStoreDialog';

const stores = [
  {
    id: 's-jms',
    code: 'jms',
    name: 'Joint Medical Store',
    store_type: 'national',
    district_id: null,
    district_name: null,
  },
  {
    id: 's-nms',
    code: 'nms',
    name: 'National Medical Stores',
    store_type: 'national',
    district_id: null,
    district_name: null,
  },
  {
    id: 's-gulu',
    code: 'gulu',
    name: 'Gulu',
    store_type: 'district',
    district_id: 'd-gulu',
    district_name: 'Gulu',
  },
  {
    id: 's-wakiso',
    code: 'wakiso',
    name: 'Wakiso',
    store_type: 'district',
    district_id: 'd-wakiso',
    district_name: 'Wakiso',
  },
];

function dcfp(store_id: string | null): User {
  return {
    id: 'u-1',
    username: 'snamubiru',
    firstname: 'Sarah',
    lastname: 'Namubiru',
    email: null,
    phone_number: null,
    status: 'active',
    role: 'dfcp',
    roles: [{ id: 'r-dfcp', name: 'dfcp', permissions: [] }],
    last_login_at: null,
    login_count: null,
    active_sessions: null,
    created_at: null,
    store_id,
  };
}

function api(write: (request: RecordedRequest) => { status: number; body?: unknown }) {
  return (request: RecordedRequest) =>
    request.method === 'GET'
      ? { status: 200, body: { success: true, data: stores } }
      : write(request);
}

const writes = (requests: RecordedRequest[]) =>
  requests.filter((request) => request.method !== 'GET');

describe('EditStoreDialog', () => {
  it('offers a DCFP only district stores and saves the one chosen', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { requests } = renderApp(<EditStoreDialog user={dcfp('s-wakiso')} onClose={onClose} />, {
      signedIn: true,
      replies: [api(() => ({ status: 200, body: { success: true } }))],
    });

    const dialog = await screen.findByRole('dialog', { name: 'Store for Sarah Namubiru' });
    const field = within(dialog).getByRole('combobox', { name: 'Store' });
    await waitFor(() => {
      expect(field).toHaveTextContent('Wakiso district store');
    });
    await user.click(field);
    expect(await screen.findByRole('option', { name: /Gulu district store/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Joint Medical Store/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: /Gulu district store/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Save store' }));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
    expect(writes(requests)).toEqual([
      expect.objectContaining({
        method: 'PATCH',
        url: '/users/u-1/store',
        body: { store_id: 's-gulu' },
      }),
    ]);
  });

  it('clears the store with "No store", and shows a refusal beside the field', async () => {
    const user = userEvent.setup();
    const { requests } = renderApp(<EditStoreDialog user={dcfp('s-wakiso')} onClose={vi.fn()} />, {
      signedIn: true,
      replies: [
        api(() => ({
          status: 422,
          body: {
            success: false,
            message: 'validation failed',
            error: { store_id: 'Choose an existing store.' },
          },
        })),
      ],
    });

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('combobox', { name: 'Store' }));
    await user.click(await screen.findByRole('option', { name: 'No store' }));
    await user.click(within(dialog).getByRole('button', { name: 'Save store' }));

    expect(await within(dialog).findByText('Choose an existing store.')).toBeInTheDocument();
    expect(writes(requests)).toEqual([
      expect.objectContaining({ method: 'PATCH', body: { store_id: null } }),
    ]);
  });
});
