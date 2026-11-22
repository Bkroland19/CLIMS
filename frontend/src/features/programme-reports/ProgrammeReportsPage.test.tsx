import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { RecordedRequest } from '@/test/fakeAdapter';
import { renderApp, sessionWith } from '@/test/renderApp';

import type { ReportTable, ReportVersion } from './api';
import { displayCell } from './files';
import ProgrammeReportsPage from './ProgrammeReportsPage';

const envelope = (data: unknown) => ({ success: true, data });

const TABLE: ReportTable = {
  report: 'notifications',
  title: 'Notification fulfilment',
  period: '2026-11-01 to 2026-11-22',
  data_updated_at: '2026-11-22T09:00:00Z',
  scope: 'National',
  product: 'Male condoms',
  rule_version: 'reporting-requirements-0.2-draft',
  filters: { from: '2026-11-01', to: '2026-11-22', category: 'male' },
  definitions: ['A blank cell means not applicable or not recorded; 0 is a recorded zero.'],
  columns: [
    { key: 'hot_spot', header: 'Hotspot' },
    { key: 'status', header: 'Status' },
    { key: 'received_male_pieces', header: 'Male pieces acknowledged' },
    { key: 'response_hours', header: 'Response hours' },
  ],
  rows: [
    {
      hot_spot: 'Owino Market',
      status: 'awaiting_acknowledgement',
      received_male_pieces: 0,
      response_hours: null,
    },
  ],
};

const SUMMARY = {
  notifications_raised: 1,
  notifications_fulfilled: 0,
  partly_received: 0,
  awaiting_acknowledgement: 1,
  awaiting_supply: 0,
  fulfilment_rate: 0,
  acknowledgements_through: '2026-11-22T09:00:00Z',
  acknowledgement_overdue: 0,
  response: { median_hours: null, pending: 1 },
  deadline: { days: 7, target_percent: 80, on_time_rate: 0, target_met: false, late_pending: 0 },
  districts: [],
  settings: { review_cycle: 'monthly', deadline_days: 7, target_percent: 80, source: 'default' },
};

const VERSION: ReportVersion = {
  id: 'v1',
  report: 'notifications',
  title: 'Notification fulfilment',
  period: '2026-11-01 to 2026-11-22',
  scope: 'National',
  filters: {},
  data_updated_at: '2026-11-22T09:00:00Z',
  approved_by: 'Sarah Nakato',
  note: null,
  supersedes_id: null,
  correction_reason: null,
  superseded_by_id: 'v2',
  status: 'superseded',
  created_at: '2026-11-22T09:00:00Z',
};

function api(request: RecordedRequest) {
  const path = new URL(request.url, 'http://test').pathname;
  if (path === '/reports/export/notifications') return { status: 200, body: envelope(TABLE) };
  if (path === '/reports/notifications') return { status: 200, body: envelope(SUMMARY) };
  if (path === '/reports/versions') return { status: 200, body: envelope([VERSION]) };
  if (path === '/reports/versions/v1')
    return { status: 200, body: envelope({ ...VERSION, export: TABLE }) };
  return { status: 404, body: { success: false, message: 'Not found' } };
}

describe('ProgrammeReportsPage', () => {
  it("shows the server's rows with its filters, a genuine zero apart from blank data", async () => {
    const { requests } = renderApp(<ProgrammeReportsPage workspace="moh" />, {
      route: '/moh/programme-reports?view=notifications&category=male',
      session: sessionWith(['reports:read', 'reports:approve']),
      replies: [api],
    });

    const row = (await screen.findByRole('cell', { name: 'Owino Market' })).closest('tr');
    if (!row) throw new Error('no row');
    expect(within(row).getByText('Awaiting acknowledgement')).toBeInTheDocument();
    expect(within(row).getByText('0')).toBeInTheDocument();
    expect(within(row).getByText('—')).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: /Male pieces acknowledged/ }),
    ).toBeInTheDocument();
    expect(requests.map((request) => request.url)).toContain(
      '/reports/export/notifications?category=male',
    );
    expect(await screen.findByText('Not applicable')).toBeInTheDocument(); // median response with nothing fulfilled
    expect(screen.getByText('Male condoms')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve version' })).toBeEnabled();
  });

  it('offers approval only with reports:approve', async () => {
    renderApp(<ProgrammeReportsPage workspace="moh" />, {
      route: '/moh/programme-reports?view=notifications',
      session: sessionWith(['reports:read']),
      replies: [api],
    });
    await screen.findByRole('cell', { name: 'Owino Market' });
    expect(screen.queryByRole('button', { name: 'Approve version' })).not.toBeInTheDocument();
  });

  it('lists approved versions and opens one, kept as approved after a correction', async () => {
    const user = userEvent.setup();
    renderApp(<ProgrammeReportsPage workspace="moh" />, {
      route: '/moh/programme-reports?view=versions',
      session: sessionWith(['reports:read', 'reports:approve']),
      replies: [api],
    });
    await user.click(await screen.findByRole('link', { name: 'Notification fulfilment' }));
    expect(await screen.findByText(/kept as they were approved/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Correct' })).not.toBeInTheDocument();
  });

  it('keeps blank, zero, dates and timestamps distinct', () => {
    expect(displayCell('received_male_pieces', 0)).toBe('0');
    expect(displayCell('response_hours', null)).toBe('—');
    expect(displayCell('reconciled', false)).toBe('No');
    expect(displayCell('expiry_date', '2027-01-31T00:00:00Z')).toMatch(/31 Jan 2027/);
    expect(displayCell('band', 'under_1_month')).toBe('Under 1 month');
  });
});
