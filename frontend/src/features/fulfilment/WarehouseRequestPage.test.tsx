import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { anOrder, aRequest, DISPATCH_DETAILS, fulfilmentApi } from '@/test/fulfilmentFixtures';
import { recordFocus } from '@/test/recordFocus';
import { renderApp } from '@/test/renderApp';

import WarehouseRequestPage from './WarehouseRequestPage';

const ROUTE = '/dcfp/restock/WR-2026-0032';
const dispatched = aRequest({
  status: 'dispatched',
  dispatch: DISPATCH_DETAILS,
  linked_orders: ['ORD-0150'],
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-20T09:00:00Z') });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('WarehouseRequestPage', () => {
  it('requires a discrepancy note and both checks before issuing the GRN', async () => {
    const user = userEvent.setup();
    const { requests } = renderApp(<WarehouseRequestPage />, {
      route: ROUTE,
      signedIn: true,
      replies: [
        fulfilmentApi({
          requests: [dispatched],
          orders: [anOrder({ id: 'ORD-0150', status: 'on_hold' })],
        }),
      ],
    });

    const counted = await screen.findByLabelText('Counted, batch ENG-2409-117');
    expect(screen.getByText(/No discrepancy\./)).toBeInTheDocument();
    await user.clear(counted);
    await user.type(counted, '5800');

    expect(await screen.findByText('Document discrepancy')).toBeInTheDocument();
    expect(screen.getByText(/ENG-2409-117: −200 against the waybill/)).toBeInTheDocument();
    // Fewer counted than sent: a short delivery is suggested.
    expect(screen.getByRole('combobox', { name: 'Type' })).toHaveTextContent('Short delivery');

    const note = screen.getByLabelText('What happened');
    const landings = recordFocus(note);
    await user.click(screen.getByRole('button', { name: 'Confirm receipt and issue GRN' }));
    await waitFor(() => {
      expect(note).toHaveFocus();
    });
    expect(landings).toEqual([
      { invalid: true, description: 'Say what happened before confirming.' },
    ]);
    expect(screen.getByText('Say what happened before confirming.')).toHaveAttribute(
      'role',
      'alert',
    );
    expect(note).toHaveAccessibleDescription('Say what happened before confirming.');
    expect(
      screen.getByText('Confirm both checks before issuing the goods received note.'),
    ).toBeInTheDocument();
    expect(requests.some((request) => request.method === 'POST')).toBe(false);

    // Pasted, not typed: key-by-key typing of a sentence pushes this test past its timeout under
    // coverage, and nothing here depends on individual keystrokes.
    await user.click(note);
    await user.paste('One carton missing from the truck');
    await user.click(
      screen.getByRole('checkbox', {
        name: 'I checked batch numbers and expiry dates on the cartons',
      }),
    );
    await user.click(
      screen.getByRole('checkbox', { name: 'I signed waybill WB-NMS-26-1187 and kept a copy' }),
    );
    await user.click(screen.getByRole('button', { name: 'Confirm receipt and issue GRN' }));

    await waitFor(() => {
      expect(requests.find((request) => request.method === 'POST')).toMatchObject({
        url: '/warehouse-requests/WR-2026-0032/receive',
        body: {
          lines: [
            {
              product: 'male',
              batch: 'ENG-2409-117',
              counted: 5800,
              damaged: 0,
              condition: 'Intact',
            },
            {
              product: 'female',
              batch: 'FC2-2408-044',
              counted: 300,
              damaged: 0,
              condition: 'Intact',
            },
          ],
          discrepancy: { type: 'Short delivery', note: 'One carton missing from the truck' },
        },
      });
    });
  });

  it('takes focus to what needs fixing, then to the receipt once it is recorded', async () => {
    const user = userEvent.setup();
    const received = aRequest({
      status: 'received',
      dispatch: DISPATCH_DETAILS,
      linked_orders: ['ORD-0150'],
      receipt: {
        received_at: '2026-11-20T08:58:00Z',
        received_by: 'Sarah Namubiru',
        grn: 'GRN-WAK-2026-015',
        accepted: { male: 6000, female: 300 },
        store_after: { male: 7400, female: 360 },
        lines: DISPATCH_DETAILS.lines.map((line) => ({
          ...line,
          on_waybill: line.quantity,
          counted: line.quantity,
          damaged: 0,
          condition: 'Intact',
          accepted: line.quantity,
        })),
        discrepancy: null,
      },
    });
    let isReceived = false;
    renderApp(<WarehouseRequestPage />, {
      route: ROUTE,
      signedIn: true,
      replies: [
        (request: { method: string; url: string }) => {
          if (request.method === 'POST') isReceived = true;
          return fulfilmentApi({
            requests: [isReceived ? received : dispatched],
            orders: [anOrder({ id: 'ORD-0150', status: 'on_hold' })],
          })(request);
        },
      ],
    });

    const submit = await screen.findByRole('button', { name: 'Confirm receipt and issue GRN' });
    const cartons = screen.getByRole('checkbox', {
      name: 'I checked batch numbers and expiry dates on the cartons',
    });
    const landings = recordFocus(cartons);
    await user.click(submit);

    await waitFor(() => {
      expect(cartons).toHaveFocus();
    });
    // On the first try the field is already invalid and described as focus lands.
    expect(landings).toEqual([
      {
        invalid: true,
        description: 'Confirm both checks before issuing the goods received note.',
      },
    ]);
    expect(cartons).toBeInvalid();
    expect(cartons).toHaveAccessibleDescription(
      'Confirm both checks before issuing the goods received note.',
    );
    expect(
      screen.getByText('Confirm both checks before issuing the goods received note.'),
    ).toHaveAttribute('role', 'alert');

    await user.click(cartons);
    await user.click(
      screen.getByRole('checkbox', { name: 'I signed waybill WB-NMS-26-1187 and kept a copy' }),
    );
    await user.click(submit);

    await waitFor(() => {
      expect(
        screen.getByText(/district stock updated$/).closest('[data-slot="alert"]'),
      ).toHaveFocus();
    });
    // Only the GRN prints from this page.
    expect(
      screen
        .getByRole('heading', { name: 'Goods received note GRN-WAK-2026-015' })
        .closest('[data-print-region]'),
    ).not.toBeNull();
  });

  it('records damaged pieces, accepting only the good ones', async () => {
    const user = userEvent.setup();
    renderApp(<WarehouseRequestPage />, {
      route: ROUTE,
      signedIn: true,
      replies: [fulfilmentApi({ requests: [dispatched] })],
    });

    await user.click(
      await screen.findByRole('combobox', { name: 'Condition of batch FC2-2408-044' }),
    );
    await user.click(await screen.findByRole('option', { name: 'Damaged' }));
    const damaged = await screen.findByLabelText('Damaged pieces, batch FC2-2408-044');
    await user.clear(damaged);
    await user.type(damaged, '400');
    expect(damaged).toHaveAccessibleDescription('More than counted');
    // Shown while typing, so announced politely rather than as an alert.
    expect(screen.getByText('More than counted')).toHaveAttribute('aria-live', 'polite');

    await user.clear(damaged);
    await user.type(damaged, '20');
    expect(screen.getByText('280')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Type' })).toHaveTextContent('Damaged or expired');
  });

  it('shows the GRN and what the delivery frees once received', async () => {
    renderApp(<WarehouseRequestPage />, {
      route: ROUTE,
      signedIn: true,
      replies: [
        fulfilmentApi({
          requests: [
            aRequest({
              status: 'received',
              dispatch: DISPATCH_DETAILS,
              receipt: {
                received_at: '2026-11-19T12:00:00Z',
                received_by: 'Sarah Namubiru',
                grn: 'GRN-WAK-2026-014',
                accepted: { male: 6000, female: 300 },
                store_after: { male: 7400, female: 360 },
                lines: DISPATCH_DETAILS.lines.map((line) => ({
                  ...line,
                  on_waybill: line.quantity,
                  counted: line.quantity,
                  damaged: 0,
                  condition: 'Intact',
                  accepted: line.quantity,
                })),
                discrepancy: null,
              },
            }),
          ],
          orders: [anOrder({ id: 'ORD-0150', status: 'on_hold' })],
        }),
      ],
    });

    expect(await screen.findByText('Goods received note GRN-WAK-2026-014')).toBeInTheDocument();
    expect(
      await screen.findByText('1 order is on hold: 1 can now be fulfilled.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Review held orders' })).toHaveAttribute(
      'href',
      '/dcfp/orders/held',
    );
    expect(screen.queryByRole('button', { name: 'Confirm receipt and issue GRN' })).toBeNull();
  });

  it('explains what the district is waiting for while the warehouse has it', async () => {
    renderApp(<WarehouseRequestPage />, {
      route: ROUTE,
      signedIn: true,
      replies: [
        fulfilmentApi({
          requests: [aRequest({ status: 'on_hold', hold_reason: 'Out of FC2 at Entebbe' })],
        }),
      ],
    });

    expect(await screen.findByText('On hold at NMS')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Out of FC2 at Entebbe. Linked orders stay on hold until this stock arrives.',
      ),
    ).toBeInTheDocument();
  });

  it('says so when the request does not exist', async () => {
    renderApp(<WarehouseRequestPage />, {
      route: '/dcfp/restock/WR-0000',
      signedIn: true,
      replies: [fulfilmentApi({ requests: [] })],
    });

    expect(await screen.findByText("That warehouse request isn't available")).toBeInTheDocument();
  });
});
