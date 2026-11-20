import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { FakeReply } from '@/test/fakeAdapter';
import { renderApp } from '@/test/renderApp';
import { aReport, aSentReport } from '@/test/reportFixtures';

import ReportPage from './ReportPage';

const ROUTE = '/dcfp/reports/RPT-2610-WAKISO';
const REPORT_URL = '/monthly-reports/RPT-2610-WAKISO';

/**
 * Answers the report read, and the submission with `rejection` or, without
 * one, the sent report; once it is sent, reads return the sent report too.
 */
function replies(rejection?: { status: number; body: unknown }): FakeReply[] {
  let sent = false;
  return [
    (request) => {
      if (request.method === 'POST' && request.url === `${REPORT_URL}/submit`) {
        if (rejection) return rejection;
        sent = true;
        return { status: 200, body: aSentReport() };
      }
      if (request.method === 'GET' && request.url === REPORT_URL) {
        return { status: 200, body: sent ? aSentReport() : aReport() };
      }
      return { status: 404, body: { message: 'Not found' } };
    },
  ];
}

async function fill(user: ReturnType<typeof userEvent.setup>, closingMale: string) {
  await user.type(await screen.findByLabelText('Male condoms, Losses & adjustments'), '0');
  await user.type(screen.getByLabelText('Male condoms, Closing balance'), closingMale);
  await user.type(screen.getByLabelText('Female condoms, Losses & adjustments'), '0');
  await user.type(screen.getByLabelText('Female condoms, Closing balance'), '140');
  await user.type(screen.getByLabelText('Days the store was out of stock'), '0');
}

describe('ReportPage (district report)', () => {
  it('shows the figures CLIMS filled in as read-only, and only asks for the rest', async () => {
    renderApp(<ReportPage workspace="dcfp" />, {
      route: ROUTE,
      signedIn: true,
      replies: replies(),
    });

    const table = await screen.findByRole('table', { name: 'Stock movement' });
    const opening = within(table).getByText('Opening balance').closest('tr');
    expect(opening).not.toBeNull();
    expect(within(opening as HTMLElement).getByText('8,200')).toBeInTheDocument();
    expect(within(opening as HTMLElement).queryByRole('textbox')).not.toBeInTheDocument();
    expect(within(table).getAllByRole('textbox')).toHaveLength(4);
    expect(screen.getByText('Enter your October figures')).toBeInTheDocument();
  });

  it('blocks sending while the stock does not balance, and points at the field', async () => {
    const user = userEvent.setup();
    const { requests } = renderApp(<ReportPage workspace="dcfp" />, {
      route: ROUTE,
      signedIn: true,
      replies: replies(),
    });

    // 8,200 + 6,000 − 11,600 − 0 is 2,600, not 2,500.
    await fill(user, '2500');
    expect(screen.getAllByText('Expected 2,600')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Validate and send' }));

    const title = await screen.findByText('1 error to fix before this report can be sent');
    const alert = title.closest<HTMLElement>('[role="alert"]');
    if (!alert) throw new Error('The problems are not in an alert.');
    expect(alert).toHaveTextContent('Male · Closing balance');
    const closing = screen.getByLabelText('Male condoms, Closing balance');
    expect(closing).toHaveAttribute('aria-invalid', 'true');
    expect(closing).toHaveAccessibleDescription(/Doesn't balance: .* = 2,600/);
    expect(document.getElementById(closing.getAttribute('aria-describedby') ?? '')).toHaveAttribute(
      'aria-live',
      'polite',
    );
    const balanceCheck = screen.getByText('Stock balances for each product').closest('li');
    expect(balanceCheck).toHaveTextContent('Stock balances for each product: Failed');
    expect(balanceCheck).toHaveTextContent('1 error');
    expect(requests.some((request) => request.method === 'POST')).toBe(false);

    // The problem link moves focus to the field.
    await user.click(within(alert).getByRole('button', { name: /Male · Closing balance/ }));
    expect(closing).toHaveFocus();
  });

  it('sends the checked figures and then shows the read-only sent report', async () => {
    const user = userEvent.setup();
    const { requests } = renderApp(<ReportPage workspace="dcfp" />, {
      route: ROUTE,
      signedIn: true,
      replies: replies(),
    });

    await fill(user, '2,600');
    await user.type(screen.getByLabelText(/Comment/), 'Counted on the 31st.');
    await user.click(screen.getByRole('button', { name: 'Validate and send' }));

    expect(
      await screen.findByText(/^Sent to MOH/, { selector: '[data-slot="alert-title"]' }),
    ).toBeInTheDocument();
    expect(requests.find((request) => request.method === 'POST')).toEqual(
      expect.objectContaining({
        url: `${REPORT_URL}/submit`,
        body: {
          figures: {
            male: {
              opening: 8200,
              received: 6000,
              issued: 11600,
              losses: 0,
              closing: 2600,
              expiring: null,
            },
            female: {
              opening: 300,
              received: 200,
              issued: 360,
              losses: 0,
              closing: 140,
              expiring: null,
            },
          },
          days_out_of_stock: 0,
          loss_reason: null,
          comment: 'Counted on the 31st.',
        },
      }),
    );
    expect(screen.queryByRole('button', { name: 'Validate and send' })).not.toBeInTheDocument();
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
  });

  it('asks why stock was lost once losses are recorded', async () => {
    const user = userEvent.setup();
    renderApp(<ReportPage workspace="dcfp" />, {
      route: ROUTE,
      signedIn: true,
      replies: replies(),
    });

    await user.type(await screen.findByLabelText('Male condoms, Losses & adjustments'), '100');
    expect(screen.getByRole('combobox', { name: /Reason for losses/ })).toBeInTheDocument();
  });

  it("keeps the figures and shows the server's own findings when it rejects the report", async () => {
    const user = userEvent.setup();
    renderApp(<ReportPage workspace="dcfp" />, {
      route: ROUTE,
      signedIn: true,
      replies: replies({
        status: 422,
        body: {
          success: false,
          message: 'The report did not pass validation: 1 error to fix.',
          error: { 'female.closing': 'Does not match the last stock count.' },
        },
      }),
    });

    await fill(user, '2600');
    await user.click(screen.getByRole('button', { name: 'Validate and send' }));

    const closing = screen.getByLabelText('Female condoms, Closing balance');
    await waitFor(() => {
      expect(closing).toHaveAttribute('aria-invalid', 'true');
    });
    expect(closing).toHaveValue('140');
    expect(closing).toHaveAccessibleDescription('Does not match the last stock count.');
    expect(screen.getByText('That did not go through')).toBeInTheDocument();
  });
});
