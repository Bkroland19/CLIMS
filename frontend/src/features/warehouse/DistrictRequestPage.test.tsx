import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppUnderTest } from '@/test/AppUnderTest';
import type { RecordedRequest } from '@/test/fakeAdapter';
import { aRequest, DISPATCH_DETAILS } from '@/test/fulfilmentFixtures';
import { recordFocus } from '@/test/recordFocus';
import { renderApp } from '@/test/renderApp';
import { aWarehouseStock, warehouseApi } from '@/test/warehouseFixtures';

const ID = 'WR-2026-0030';
const ROUTE = `/warehouse/requests/${ID}?store=NMS`;
const ACTION = (action: string) => `/warehouses/NMS/requests/${ID}/${action}`;

const mukono = (overrides: Parameters<typeof aRequest>[0] = {}) =>
  aRequest({
    id: ID,
    district: 'Mukono',
    requested_by: 'Harriet Achieng',
    items: { male: 12000, female: 600 },
    ...overrides,
  });

// Shelf-life rules and first-expiry-first-out picks depend on today's date; only `Date` is faked.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-20T09:00:00Z') });
});
afterEach(() => {
  vi.useRealTimers();
});

function render(request: ReturnType<typeof mukono>) {
  return renderApp(<AppUnderTest />, {
    route: ROUTE,
    signedIn: true,
    replies: [warehouseApi({ requests: [request], stock: aWarehouseStock() })],
  });
}

async function checkStock(user: ReturnType<typeof userEvent.setup>) {
  const check = await screen.findByRole('button', { name: 'Check stock' });
  await waitFor(() => {
    expect(check).toBeEnabled();
  });
  await user.click(check);
}

const posts = (requests: RecordedRequest[]) =>
  requests.filter((request) => request.method === 'POST');

describe('DistrictRequestPage', () => {
  it('marks a new request as under review when it is opened', async () => {
    const { requests } = render(mukono({ status: 'sent' }));
    expect(await screen.findByText('Review the request')).toBeInTheDocument();
    await waitFor(() => {
      expect(posts(requests)).toEqual([expect.objectContaining({ url: ACTION('open') })]);
    });
  });

  it('accepts a request and queues it for picking', async () => {
    const user = userEvent.setup();
    const { requests } = render(mukono({ status: 'under_review' }));

    expect(
      await screen.findByText(
        'Harriet Achieng needs this stock for the Mukono district store. Accept it to queue it for picking.',
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Accept and queue request' }));

    await waitFor(() => {
      expect(posts(requests)).toEqual([expect.objectContaining({ url: ACTION('accept') })]);
    });
    // Opening only happens to a request nobody has looked at yet.
    expect(requests.some((request) => request.url === ACTION('open'))).toBe(false);
  });

  it('moves focus to the banner once accepting has replaced the button', async () => {
    const user = userEvent.setup();
    let isAccepted = false;
    renderApp(<AppUnderTest />, {
      route: ROUTE,
      signedIn: true,
      replies: [
        (request: { method: string; url: string }) => {
          if (request.method === 'POST' && request.url.endsWith('/accept')) isAccepted = true;
          return warehouseApi({
            requests: [mukono({ status: isAccepted ? 'queued' : 'under_review' })],
            stock: aWarehouseStock(),
          })(request);
        },
      ],
    });

    await user.click(await screen.findByRole('button', { name: 'Accept and queue request' }));

    await waitFor(() => {
      expect(screen.getByText('Queued for picking').closest('[data-slot="alert"]')).toHaveFocus();
    });
  });

  it('carries focus into the hold reasons, and to the first empty waybill field', async () => {
    const user = userEvent.setup();
    render(mukono({ status: 'queued' }));

    await checkStock(user);
    const dispatch = await screen.findByRole('button', {
      name: 'Dispatch to Mukono district store',
    });
    const waybill = screen.getByLabelText('Waybill number');
    const landings = recordFocus(waybill);
    await user.click(dispatch);
    await waitFor(() => {
      expect(waybill).toHaveFocus();
    });
    // The error is rendered, and announced, by the time focus arrives on the first try.
    expect(landings).toEqual([{ invalid: true, description: 'Enter the waybill number.' }]);
    expect(screen.getByText('Enter the waybill number.')).toHaveAttribute('role', 'alert');

    await user.type(waybill, 'WB-NMS-26-1190');
    await user.click(dispatch);
    await waitFor(() => {
      expect(screen.getByLabelText('Vehicle')).toHaveFocus();
    });

    await user.click(screen.getByRole('button', { name: 'Put on hold instead' }));
    expect(screen.getByRole('radio', { name: 'Awaiting supplier delivery' })).toHaveFocus();
  });

  it('will not put a request on hold without a reason', async () => {
    const user = userEvent.setup();
    const { requests } = render(
      mukono({ status: 'queued', items: { male: 12000, female: 20000 } }),
    );

    await checkStock(user);
    expect(await screen.findByText('Not enough stock to fill this request')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Female condoms: 10,000 dispatchable, 20,000 needed. Put the request on hold.',
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Put on hold and notify district' }));
    const reason = screen.getByRole('group', { name: 'Reason' });
    expect(within(reason).getByRole('alert')).toHaveTextContent('Choose a reason for the hold.');
    expect(reason).toHaveAccessibleDescription('Choose a reason for the hold.');
    expect(posts(requests)).toEqual([]);

    await user.click(screen.getByRole('radio', { name: 'Batch on quality hold' }));
    await user.click(screen.getByRole('button', { name: 'Put on hold and notify district' }));

    await waitFor(() => {
      expect(posts(requests)).toEqual([
        expect.objectContaining({ url: ACTION('hold'), body: { reason: 'Batch on quality hold' } }),
      ]);
    });
  });

  it('issues stock first-expiry-first-out from dispatchable batches, with the waybill details', async () => {
    const user = userEvent.setup();
    const { requests } = render(mukono({ status: 'queued' }));

    await checkStock(user);
    expect(await screen.findByText('Stock is available')).toBeInTheDocument();
    // The near-expiry batch expires first but is under six months, so the suggestion skips it.
    expect(screen.getByLabelText('Pieces to pick from batch ENG-2112-007')).toHaveValue('0');
    expect(screen.getByLabelText('Pieces to pick from batch ENG-2310-044')).toHaveValue('12000');
    expect(screen.getByLabelText('Pieces to pick from batch FC2-2408-044')).toHaveValue('600');
    expect(
      screen.queryByLabelText('Pieces to pick from batch ENG-2011-003'),
    ).not.toBeInTheDocument();

    const dispatch = screen.getByRole('button', { name: 'Dispatch to Mukono district store' });
    await user.click(dispatch);
    expect(screen.getByLabelText('Waybill number')).toHaveAccessibleDescription(
      'Enter the waybill number.',
    );
    expect(posts(requests)).toEqual([]);

    await user.type(screen.getByLabelText('Waybill number'), 'WB-NMS-26-1190');
    await user.type(screen.getByLabelText('Vehicle'), 'UAX 233K');
    await user.type(screen.getByLabelText('Driver'), 'Isaac Mutebi');
    await user.click(dispatch);

    await waitFor(() => {
      expect(posts(requests)).toEqual([
        expect.objectContaining({
          url: ACTION('dispatch'),
          body: {
            waybill: 'WB-NMS-26-1190',
            vehicle: 'UAX 233K',
            driver: 'Isaac Mutebi',
            lines: [
              { product: 'male', batch: 'ENG-2310-044', quantity: 12000 },
              { product: 'female', batch: 'FC2-2408-044', quantity: 600 },
            ],
          },
        }),
      ]);
    });
  });

  it('warns when issuing less than was requested, and still lets it go', async () => {
    const user = userEvent.setup();
    const { requests } = render(mukono({ status: 'queued' }));

    await checkStock(user);
    const female = await screen.findByLabelText('Pieces to pick from batch FC2-2408-044');
    await user.clear(female);
    await user.type(female, '400');
    expect(
      screen.getByText(
        'You are issuing less than was needed. The district will see the difference on the waybill.',
      ),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText('Waybill number'), 'WB-NMS-26-1191');
    await user.type(screen.getByLabelText('Vehicle'), 'UAX 233K');
    await user.type(screen.getByLabelText('Driver'), 'Isaac Mutebi');
    await user.click(screen.getByRole('button', { name: 'Dispatch to Mukono district store' }));

    await waitFor(() => {
      expect(posts(requests)[0]?.body).toMatchObject({
        lines: [
          { product: 'male', batch: 'ENG-2310-044', quantity: 12000 },
          { product: 'female', batch: 'FC2-2408-044', quantity: 400 },
        ],
      });
    });
  });

  it('announces a pick over what a batch holds without interrupting', async () => {
    const user = userEvent.setup();
    render(mukono({ status: 'queued' }));

    await checkStock(user);
    const female = await screen.findByLabelText('Pieces to pick from batch FC2-2408-044');
    await user.clear(female);
    await user.type(female, '999999');

    expect(female).toBeInvalid();
    expect(female).toHaveAccessibleDescription('More than available');
    expect(screen.getByText('More than available')).toHaveAttribute('aria-live', 'polite');
  });

  it('says so when the activity cannot be loaded, and offers to try again', async () => {
    const request = mukono({ status: 'queued' });
    const api = warehouseApi({ requests: [request], stock: aWarehouseStock() });
    renderApp(<AppUnderTest />, {
      route: ROUTE,
      signedIn: true,
      replies: [
        (sent) =>
          sent.url.startsWith('/warehouses/NMS/activity')
            ? { status: 404, body: { success: false, message: 'The activity feed is offline.' } }
            : api(sent),
      ],
    });

    const title = await screen.findByText('Could not load the activity');
    expect(title.closest('[role="alert"]')).toHaveTextContent('The activity feed is offline.');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('shows the waybill of a dispatched request', async () => {
    render(mukono({ status: 'dispatched', dispatch: DISPATCH_DETAILS }));
    expect(await screen.findByText('Waybill WB-NMS-26-1187')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Waybill WB-NMS-26-1187 · UBF 903T. Waiting for Mukono to receive and verify.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Check stock' })).not.toBeInTheDocument();
  });

  it('says so when the request belongs to the other warehouse', async () => {
    renderApp(<AppUnderTest />, {
      route: `/warehouse/requests/${ID}?store=JMS`,
      signedIn: true,
      replies: [warehouseApi({ requests: [mukono({ status: 'queued' })] })],
    });
    expect(await screen.findByText("That request at JMS isn't available")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to district requests' })).toHaveAttribute(
      'href',
      '/warehouse/requests?store=JMS',
    );
  });
});
