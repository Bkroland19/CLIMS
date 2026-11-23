import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { ReadOnlyProvider } from '@/navigation/useAccess';
import { aReport, FEMALE } from '@/test/dcfpFixtures';
import type { RecordedRequest } from '@/test/fakeAdapter';
import { renderApp, sessionWith } from '@/test/renderApp';
import { aProductSummary, aStoreSummary, warehouseOrderApi } from '@/test/warehouseOrderFixtures';

import type { StockoutDetail, StockoutReport } from './api';
import StockoutRequestPage from './StockoutRequestPage';

const storeId = 'store-wakiso';
const report = aReport({ district_store_id: storeId, status: 'awaiting_supply' });
const route = `/dcfp/stockouts/${report.id}`;
const SENDER = ['orders:read', 'orders:supply_hotspots', 'orders:replenish', 'inventory:read'];

function session(permissions = SENDER) {
  const result = sessionWith(permissions, ['dcfp']);
  result.user.store_id = storeId;
  return result;
}

/** Days from now as YYYY-MM-DD, for batches near or far from expiry. */
function inDays(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function stockOf(usable: number, nextExpiry = inDays(400)) {
  return aStoreSummary({
    store_id: storeId,
    store_type: 'district',
    products: usable > 0 ? [aProductSummary({ usable, next_expiry: nextExpiry })] : [],
  });
}

const delivery: StockoutDetail['deliveries'][number] = {
  id: 'delivery-1',
  note: 'With the VHT on a boda',
  created_at: '2026-11-23T07:00:00Z',
  lines: [
    {
      id: 'line-1',
      product: 'Engabu · Female · Free',
      category: 'female',
      quantity: 2,
      pieces: 200,
      acknowledged_pieces: null,
      acknowledged_at: null,
    },
  ],
};

function detail(overrides: Partial<StockoutDetail> = {}): StockoutDetail {
  return {
    ...report,
    events: [
      {
        id: 'e1',
        action: 'raised',
        selection: 'female',
        data: { comment: 'Dispenser empty since Monday' },
        created_at: report.created_at,
      },
    ],
    deliveries: [],
    ...overrides,
  };
}

const MOSES = { id: 'u-moses', name: 'Moses Kato', phone: '0772000111' };

function api(data: StockoutDetail = detail(), stock = stockOf(5), riders = [MOSES]) {
  const inventory = warehouseOrderApi({ summary: stock, products: [FEMALE] });
  return (request: RecordedRequest) => {
    if (request.url === `/orders/stockouts/${report.id}`)
      return { status: 200, body: { success: true, data } };
    if (request.url === `/orders/stockouts/${report.id}/riders`)
      return { status: 200, body: { success: true, data: riders } };
    return inventory(request);
  };
}

describe('Stockout request', () => {
  it('shows what the hotspot asked for and who to call, and sends stock from the page', async () => {
    const user = userEvent.setup();
    let sent = false;
    const sentDetail = detail({
      status: 'awaiting_acknowledgement',
      deliveries: [delivery],
    });
    const { requests } = renderApp(<StockoutRequestPage />, {
      route,
      session: session(),
      replies: [
        (request) => {
          if (request.method === 'POST') {
            sent = true;
            const body: StockoutReport = { ...report, status: 'awaiting_acknowledgement' };
            return { status: 201, body: { success: true, data: body } };
          }
          return sent ? api(sentDetail, stockOf(3))(request) : api()(request);
        },
      ],
    });

    expect(await screen.findByText('Kisenyi Landing is out of female condoms')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Call 0700123456' })).toHaveAttribute(
      'href',
      'tel:0700123456',
    );
    expect(
      screen.getByText(/Reported out of female condoms — “Dispenser empty/),
    ).toBeInTheDocument();

    const quantity = await screen.findByRole('textbox', { name: 'Engabu · Female · Free' });
    expect(screen.getByText(/5 box available/)).toBeInTheDocument();
    await user.type(quantity, '2');
    // Two boxes of 100: the total is said in pieces as the DCFP types.
    expect(screen.getAllByText('200 pieces').length).toBeGreaterThan(0);
    await user.type(screen.getByRole('textbox', { name: /Note/ }), 'With the VHT on a boda');
    await user.click(screen.getByRole('button', { name: 'Send 200 pieces' }));

    expect(await screen.findByText('Stock is on its way')).toBeInTheDocument();
    expect(screen.getByText(/Sent 200 pieces/)).toBeInTheDocument();
    expect(screen.getByText(/awaiting confirmation/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send more stock' })).toBeInTheDocument();

    const writes = requests.filter((r) => r.method === 'POST');
    expect(writes).toHaveLength(1);
    expect(writes[0]?.url).toBe(`/orders/stockouts/${report.id}/deliveries`);
    expect(writes[0]?.body).toHaveProperty('client_reference');
    expect(writes[0]?.body).toMatchObject({
      lines: [{ condom_id: FEMALE.id, unit_of_measure_id: 'u-box', quantity: 2 }],
      note: 'With the VHT on a boda',
    });
    expect(writes[0]?.body).not.toHaveProperty('expiry_exception_reason');
    expect(writes[0]?.body).not.toHaveProperty('rider_id');
  });

  it('names a delivery agent, shows a refusal beside the picker, and who carried each send', async () => {
    const user = userEvent.setup();
    let posts = 0;
    const carried = detail({
      status: 'awaiting_acknowledgement',
      deliveries: [{ ...delivery, rider: MOSES }],
    });
    const { requests } = renderApp(<StockoutRequestPage />, {
      route,
      session: session(),
      replies: [
        (request) => {
          if (request.method !== 'POST') return (posts === 2 ? api(carried) : api())(request);
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
    });

    await user.type(await screen.findByRole('textbox', { name: 'Engabu · Female · Free' }), '2');
    expect(screen.getByText(/Only delivery agents in the hotspot’s district/)).toBeInTheDocument();
    await user.click(screen.getByRole('combobox', { name: /Delivery agent/ }));
    await user.click(await screen.findByRole('option', { name: 'Moses Kato · 0772000111' }));
    await user.click(screen.getByRole('button', { name: 'Send 200 pieces' }));
    expect(
      await screen.findAllByText('The delivery agent must work in the hotspot’s district.'),
    ).not.toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Send 200 pieces' }));
    expect(await screen.findByText('Carried by Moses Kato · 0772000111')).toBeInTheDocument();
    const writes = requests.filter((r) => r.method === 'POST');
    expect(writes).toHaveLength(2);
    expect(writes.at(-1)?.body).toMatchObject({ rider_id: 'u-moses' });
  });

  it('says when no delivery agent works in the district, and still sends', async () => {
    renderApp(<StockoutRequestPage />, {
      route,
      session: session(),
      replies: [api(detail(), stockOf(5), [])],
    });

    expect(
      await screen.findByText(`No delivery agents work in ${report.hot_spot.district ?? ''} yet.`),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send stock' })).toBeEnabled();
  });

  it('refuses more than the store holds, and an empty send, without posting', async () => {
    const user = userEvent.setup();
    const { requests } = renderApp(<StockoutRequestPage />, {
      route,
      session: session(),
      replies: [api()],
    });

    await user.click(await screen.findByRole('button', { name: 'Send stock' }));
    expect(screen.getByText('Enter how many to send of at least one product.')).toBeInTheDocument();

    const quantity = screen.getByRole('textbox', { name: 'Engabu · Female · Free' });
    await user.type(quantity, '9');
    expect(screen.getByText('Only 5 box can be sent.')).toBeInTheDocument();
    // Nine is more than the store holds, so nothing counts toward the total.
    await user.click(screen.getByRole('button', { name: 'Send stock' }));
    expect(quantity).toHaveFocus();
    expect(requests.filter((r) => r.method === 'POST')).toHaveLength(0);
  });

  it('asks why when the oldest batch has under a month left, and sends the reason', async () => {
    const user = userEvent.setup();
    const { requests } = renderApp(<StockoutRequestPage />, {
      route,
      session: session(),
      replies: [
        (request) => {
          if (request.method === 'POST')
            return { status: 201, body: { success: true, data: report } };
          return api(detail(), stockOf(5, inDays(10)))(request);
        },
      ],
    });

    await user.type(await screen.findByRole('textbox', { name: 'Engabu · Female · Free' }), '1');
    const reason = screen.getByRole('textbox', { name: 'Why send stock that expires soon?' });
    await user.click(screen.getByRole('button', { name: 'Send 100 pieces' }));
    expect(reason).toHaveFocus();
    expect(requests.filter((r) => r.method === 'POST')).toHaveLength(0);

    await user.type(reason, 'Used within the week');
    await user.click(screen.getByRole('button', { name: 'Send 100 pieces' }));
    await waitFor(() => {
      expect(requests.filter((r) => r.method === 'POST')).toHaveLength(1);
    });
    expect(requests.find((r) => r.method === 'POST')?.body).toMatchObject({
      expiry_exception_reason: 'Used within the week',
    });
  });

  it('keeps an unconfirmed send unchanged and retries it with the same reference', async () => {
    const user = userEvent.setup();
    let attempts = 0;
    const { requests } = renderApp(<StockoutRequestPage />, {
      route,
      session: session(),
      replies: [
        (request) => {
          if (request.method === 'POST') {
            attempts += 1;
            return attempts === 1
              ? { status: 502, body: { success: false, message: 'Bad gateway' } }
              : { status: 201, body: { success: true, data: report } };
          }
          return api()(request);
        },
      ],
    });

    const quantity = await screen.findByRole('textbox', { name: 'Engabu · Female · Free' });
    await user.type(quantity, '2');
    await user.click(screen.getByRole('button', { name: 'Send 200 pieces' }));
    expect(await screen.findByText('The send could not be confirmed')).toBeInTheDocument();
    expect(quantity).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Send 200 pieces' }));
    await waitFor(() => {
      expect(requests.filter((r) => r.method === 'POST')).toHaveLength(2);
    });
    const [first, second] = requests.filter((r) => r.method === 'POST');
    expect((second?.body as { client_reference: string }).client_reference).toBe(
      (first?.body as { client_reference: string }).client_reference,
    );
  });

  it('moves focus into the form when sending more, and back to the button on cancel', async () => {
    const user = userEvent.setup();
    renderApp(<StockoutRequestPage />, {
      route,
      session: session(),
      replies: [api(detail({ status: 'awaiting_acknowledgement', deliveries: [delivery] }))],
    });

    await user.click(await screen.findByRole('button', { name: 'Send more stock' }));
    expect(screen.getByRole('region', { name: 'Send more stock' })).toHaveFocus();
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Send more stock' })).toHaveFocus();
  });

  it('offers a warehouse order when the district store has none of the type', async () => {
    renderApp(<StockoutRequestPage />, {
      route,
      session: session(),
      replies: [api(detail(), stockOf(0))],
    });

    expect(
      await screen.findByText('The district store has no female condoms to send'),
    ).toBeInTheDocument();
    const form = screen.getByRole('region', { name: 'Send stock to Kisenyi Landing' });
    expect(within(form).getByRole('link', { name: 'Order from a warehouse' })).toHaveAttribute(
      'href',
      '/dcfp/restock/new?category=female',
    );
    expect(within(form).queryByRole('button', { name: /Send/ })).not.toBeInTheDocument();
  });

  it('shows confirmed and short receipts, and nothing to send once fulfilled', async () => {
    renderApp(<StockoutRequestPage />, {
      route,
      session: session(),
      replies: [
        api(
          detail({
            status: 'fulfilled',
            deliveries: [
              {
                ...delivery,
                lines: [
                  {
                    ...delivery.lines[0]!,
                    acknowledged_pieces: 190,
                    acknowledged_at: '2026-11-23T08:00:00Z',
                  },
                ],
              },
            ],
          }),
        ),
      ],
    });

    expect(await screen.findByText('Kisenyi Landing has what it asked for')).toBeInTheDocument();
    expect(screen.getByText('190 received')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Send/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Order from a warehouse' })).not.toBeInTheDocument();
  });

  it('lets people without the permission, or in a read-only workspace, read but not send', async () => {
    const view = renderApp(<StockoutRequestPage />, {
      route,
      session: session(['orders:read', 'inventory:read']),
      replies: [api()],
    });
    expect(
      await screen.findByText('Waiting for the district store to send stock.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('textbox', { name: 'Engabu · Female · Free' }),
    ).not.toBeInTheDocument();
    view.unmount();

    renderApp(
      <ReadOnlyProvider value={true}>
        <StockoutRequestPage />
      </ReadOnlyProvider>,
      { route, session: session(), replies: [api()] },
    );
    expect(
      await screen.findByText('Waiting for the district store to send stock.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Send/ })).not.toBeInTheDocument();
  });

  it('says when another district store answers the request', async () => {
    renderApp(<StockoutRequestPage />, {
      route,
      session: session(),
      replies: [api(detail({ district_store_id: 'other-store' }))],
    });
    expect(
      await screen.findByText('Another district store answers this request'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Send/ })).not.toBeInTheDocument();
  });

  it('says so when the request does not exist', async () => {
    renderApp(<StockoutRequestPage />, {
      route,
      session: session(),
      replies: [() => ({ status: 404, body: { success: false, message: 'not found' } })],
    });
    expect(await screen.findByText("That stockout request isn't available")).toBeInTheDocument();
  });
});
