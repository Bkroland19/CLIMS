import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { aReport, BOX, FEMALE } from '@/test/dcfpFixtures';
import { renderApp } from '@/test/renderApp';
import { aProductSummary, warehouseOrderApi } from '@/test/warehouseOrderFixtures';

import { DeliverStockDialog } from './DeliverStockDialog';

const storeId = 'store-wakiso';
const male = { ...FEMALE, id: 'p-male', category: 'male' as const };
const report = aReport({
  district_store_id: storeId,
  selection: 'both',
  product: 'male and female condoms',
  status: 'awaiting_supply',
});
const stock = [aProductSummary({ usable: 5 }), aProductSummary({ condom_id: male.id, usable: 9 })];
const api = warehouseOrderApi({ products: [FEMALE, male] });

describe('Dispatch to hotspot', () => {
  it('names a delivery agent from the hotspot’s district, and shows a refusal beside the picker', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    let posts = 0;
    const { requests } = renderApp(
      <DeliverStockDialog storeId={storeId} stock={stock} onClose={onClose} />,
      {
        signedIn: true,
        replies: [
          (request) => {
            if (request.url.endsWith('/riders'))
              return {
                status: 200,
                body: {
                  success: true,
                  data: [{ id: 'u-moses', name: 'Moses Kato', phone: '0772000111' }],
                },
              };
            if (!request.url.startsWith('/orders/stockouts')) return api(request);
            if (request.method === 'GET')
              return { status: 200, body: { success: true, data: [report] } };
            posts += 1;
            return posts === 1
              ? {
                  status: 422,
                  body: {
                    success: false,
                    message: 'the delivery agent must work in the hotspot’s district',
                    error: { rider_id: 'The delivery agent must work in the hotspot’s district.' },
                  },
                }
              : { status: 201, body: { success: true, data: report } };
          },
        ],
      },
    );
    await user.click(await screen.findByRole('combobox', { name: /Hotspot stockout/ }));
    await user.click(await screen.findByRole('option', { name: /Kisenyi Landing/ }));
    await user.type(await screen.findByRole('spinbutton', { name: /Female/ }), '2');

    await user.click(screen.getByRole('combobox', { name: /Delivery agent/ }));
    await user.click(await screen.findByRole('option', { name: 'Moses Kato · 0772000111' }));
    await user.click(screen.getByRole('button', { name: 'Record dispatch' }));
    expect(
      await screen.findAllByText('The delivery agent must work in the hotspot’s district.'),
    ).not.toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Record dispatch' }));
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledOnce();
    });
    const sent = requests.filter((r) => r.method === 'POST');
    expect(sent.at(-1)?.body).toMatchObject({ rider_id: 'u-moses' });
  });

  it('sends no delivery agent unless one is chosen', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { requests } = renderApp(
      <DeliverStockDialog storeId={storeId} stock={stock} onClose={onClose} />,
      {
        signedIn: true,
        replies: [
          (request) => {
            if (request.url.endsWith('/riders'))
              return { status: 200, body: { success: true, data: [] } };
            if (!request.url.startsWith('/orders/stockouts')) return api(request);
            return {
              status: 200,
              body: { success: true, data: request.method === 'GET' ? [report] : report },
            };
          },
        ],
      },
    );
    await user.click(await screen.findByRole('combobox', { name: /Hotspot stockout/ }));
    await user.click(await screen.findByRole('option', { name: /Kisenyi Landing/ }));
    expect(await screen.findByText(/No delivery agents work in Kampala yet/)).toBeInTheDocument();
    await user.type(await screen.findByRole('spinbutton', { name: /Female/ }), '2');
    await user.click(screen.getByRole('button', { name: 'Record dispatch' }));
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledOnce();
    });
    expect(requests.find((r) => r.method === 'POST')?.body).not.toHaveProperty('rider_id');
  });

  it('rejects quantities above available stock, then sends both categories in one dispatch', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { requests } = renderApp(
      <DeliverStockDialog storeId={storeId} stock={stock} onClose={onClose} />,
      {
        signedIn: true,
        replies: [
          (request) =>
            request.url.startsWith('/orders/stockouts')
              ? {
                  status: 200,
                  body: { success: true, data: request.method === 'GET' ? [report] : report },
                }
              : api(request),
        ],
      },
    );
    await user.click(await screen.findByRole('combobox', { name: /Hotspot stockout/ }));
    await user.click(await screen.findByRole('option', { name: /Kisenyi Landing/ }));
    const femaleInput = await screen.findByRole('spinbutton', { name: /Female/ });
    const maleInput = screen.getByRole('spinbutton', { name: /Male/ });
    await user.type(femaleInput, '6');
    await user.type(maleInput, '3');
    await user.click(screen.getByRole('button', { name: 'Record dispatch' }));
    expect(screen.getByText('Enter a whole number from 1 to 5.')).toBeInTheDocument();
    expect(maleInput).not.toHaveAttribute('aria-invalid', 'true');
    expect(requests.filter((r) => r.method === 'POST')).toHaveLength(0);
    await user.clear(femaleInput);
    await user.type(femaleInput, '5');
    await user.click(screen.getByRole('button', { name: 'Record dispatch' }));
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledOnce();
    });
    expect(requests.find((r) => r.method === 'POST')?.body).toMatchObject({
      lines: [
        { condom_id: FEMALE.id, unit_of_measure_id: BOX.id, quantity: 5 },
        { condom_id: male.id, unit_of_measure_id: BOX.id, quantity: 3 },
      ],
    });
  });

  it('keeps an uncertain dispatch unchanged and retries with the same reference', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    let attempts = 0;
    const { requests } = renderApp(
      <DeliverStockDialog storeId={storeId} stock={stock} onClose={onClose} />,
      {
        signedIn: true,
        replies: [
          (request) => {
            if (!request.url.startsWith('/orders/stockouts')) return api(request);
            if (request.method === 'GET')
              return { status: 200, body: { success: true, data: [report] } };
            attempts += 1;
            return attempts === 1
              ? { failure: 'timeout' }
              : { status: 200, body: { success: true, data: report } };
          },
        ],
      },
    );
    await user.click(await screen.findByRole('combobox', { name: /Hotspot stockout/ }));
    await user.click(await screen.findByRole('option', { name: /Kisenyi Landing/ }));
    const quantity = await screen.findByRole('spinbutton', { name: /Female/ });
    await user.type(quantity, '2');
    await user.click(screen.getByRole('button', { name: 'Record dispatch' }));
    expect(await screen.findByText(/The dispatch result is unconfirmed/)).toBeInTheDocument();
    expect(quantity).toBeDisabled();
    expect(onClose).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Record dispatch' }));
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledOnce();
    });
    const writes = requests.filter((r) => r.method === 'POST');
    expect(writes).toHaveLength(2);
    expect(writes[0]?.body).toHaveProperty('client_reference');
    expect(writes[1]?.body).toEqual(writes[0]?.body);
  });

  it('finds older open reports beyond the first page and excludes fulfilled or other-district reports', async () => {
    const user = userEvent.setup();
    const reports = [
      ...Array.from({ length: 100 }, (_, index) =>
        aReport({ id: `closed-${String(index)}`, district_store_id: storeId, status: 'fulfilled' }),
      ),
      aReport({ id: 'other', district_store_id: 'another-store' }),
      report,
    ];
    const { requests } = renderApp(
      <DeliverStockDialog storeId={storeId} stock={stock} onClose={vi.fn()} />,
      {
        signedIn: true,
        replies: [
          (request) => {
            if (!request.url.startsWith('/orders/stockouts')) return api(request);
            const offset = Number(new URLSearchParams(request.url.split('?')[1]).get('offset'));
            return {
              status: 200,
              body: { success: true, data: reports.slice(offset, offset + 100) },
            };
          },
        ],
      },
    );
    const select = await screen.findByRole('combobox', { name: /Hotspot stockout/ });
    await waitFor(() => expect(select).toBeEnabled());
    await user.click(select);
    expect(await screen.findAllByRole('option')).toHaveLength(1);
    expect(requests.some((r) => r.url.includes('offset=100'))).toBe(true);
  });

  it('explains when there are no open stockouts', async () => {
    renderApp(<DeliverStockDialog storeId={storeId} stock={stock} onClose={vi.fn()} />, {
      signedIn: true,
      replies: [
        (request) =>
          request.url.startsWith('/orders/stockouts')
            ? { status: 200, body: { success: true, data: [] } }
            : api(request),
      ],
    });
    expect(await screen.findByText('No open hotspot stockouts')).toBeInTheDocument();
  });
});
