import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { startOfDay } from '@/features/audit/api';
import type { RecordedRequest } from '@/test/fakeAdapter';
import { testRouter } from '@/test/navigation';
import { ADMIN_PERMISSIONS, renderApp, sessionWith } from '@/test/renderApp';

import { deviceLabel, errorLabel, NO_FILTERS, syncLogQuery, type SyncLogEntry } from './api';
import { syncLogFiltersFrom, syncLogHref } from './links';
import SyncLogPage from './SyncLogPage';

const GRACE = '44444444-4444-4444-8444-444444444444';
const HOTSPOT = '11111111-1111-4111-8111-111111111111';

const sent: SyncLogEntry = {
  id: 's-0',
  client_entry_id: 'SL-m3x9k2-ab12cd',
  user: { id: GRACE, username: 'grace.vht', roles: ['vht'] },
  action: 'mapHotspot',
  status: 'sent',
  server_record_id: HOTSPOT,
  queued_at: '2026-11-20T07:00:00Z',
  changed_at: '2026-11-20T09:30:00Z',
  attempt_count: 12,
  attempts: [
    { at: '2026-11-20T09:00:00Z', http_status: null, error: 'network' },
    { at: '2026-11-20T09:30:00Z', http_status: 201, error: null },
  ],
  last_error: null,
  device: { platform: 'android', os_version: '14', app_version: '2.2.1' },
  received_at: '2026-11-20T09:30:05Z',
};

const entries: SyncLogEntry[] = [
  sent,
  {
    ...sent,
    id: 's-1',
    client_entry_id: 'SL-m3x9k3-zz99yy',
    action: 'stockout',
    status: 'refused',
    server_record_id: null,
    attempt_count: 1,
    attempts: [{ at: '2026-11-20T08:00:00Z', http_status: 409, error: 'http_409' }],
    last_error: 'http_409',
  },
];

const reply = (data: unknown) => ({ status: 200, body: { success: true, data } });

/** Answers like the server for the status filter; the rest is checked through the request URL. */
function api(request: RecordedRequest) {
  const query = new URLSearchParams(request.url.split('?')[1] ?? '');
  const status = query.get('status');
  return reply(entries.filter((entry) => !status || entry.status === status));
}

const query = (request: RecordedRequest | undefined) =>
  new URLSearchParams(request?.url.split('?')[1] ?? '');

describe('sync log filters', () => {
  it('reads only well-formed filters from the address', () => {
    expect(
      syncLogFiltersFrom(
        new URLSearchParams(
          `status=retrying&action=stockout&user=${GRACE}&from=2026-11-01&to=2026-11-20`,
        ),
      ),
    ).toEqual({
      status: 'retrying',
      action: 'stockout',
      user: GRACE,
      from: '2026-11-01',
      to: '2026-11-20',
    });
    expect(
      syncLogFiltersFrom(new URLSearchParams('status=discarded&action=rpt&user=nope&from=today')),
    ).toEqual(NO_FILTERS);
  });

  it('leaves defaults out of the address and asks for whole local days', () => {
    expect(syncLogHref()).toBe('/moh/audit/sync-log');
    expect(syncLogHref({ status: 'refused' })).toBe('/moh/audit/sync-log?status=refused');
    const params = syncLogQuery({
      ...NO_FILTERS,
      user: GRACE,
      from: '2026-11-01',
      to: '2026-11-20',
    });
    expect(params.get('user_id')).toBe(GRACE);
    expect(params.get('from')).toBe(startOfDay('2026-11-01'));
    expect(params.get('to')).toBe(new Date(2026, 10, 21).toISOString());
    expect(syncLogQuery(NO_FILTERS, 50).get('offset')).toBe('50');
  });

  it('words error codes and phones', () => {
    expect(errorLabel('network')).toBe('No network');
    expect(errorLabel('http_409')).toBe('Conflict (409)');
    expect(errorLabel('http_503')).toBe('Server error (503)');
    expect(errorLabel('http_418')).toBe('HTTP 418');
    expect(deviceLabel(sent.device)).toBe('Android 14 · app 2.2.1');
    expect(deviceLabel({ platform: 'ios', os_version: '', app_version: '' })).toBe('iOS');
  });
});

describe('SyncLogPage', () => {
  it('lists each saved action and how sending it went, and expands to every try', async () => {
    const user = userEvent.setup();
    const { requests } = renderApp(<SyncLogPage />, {
      route: '/moh/audit/sync-log',
      signedIn: true,
      replies: [api],
    });

    expect(await screen.findAllByText('grace.vht')).not.toHaveLength(0);
    expect(screen.getAllByText('Hotspot mapped')).not.toHaveLength(0);
    expect(screen.getAllByText('Refused')).not.toHaveLength(0);
    expect(screen.getAllByText('Conflict (409)')).not.toHaveLength(0);
    expect(requests[0]?.url).toBe('/sync-log?limit=50');

    await user.click(
      screen.getByRole('button', { name: /^Show tries of hotspot mapped by grace\.vht/ }),
    );
    const tries = screen.getByRole('table', { name: 'Tries: hotspot mapped by grace.vht' });
    expect(within(tries).getByText('No network')).toBeInTheDocument();
    expect(within(tries).getByText('Accepted')).toBeInTheDocument();
    expect(screen.getByText('10 earlier tries are counted but no longer listed.')).toBeVisible();
    expect(screen.getByText(HOTSPOT)).toBeVisible();
    expect(screen.getByRole('link', { name: 'What the server recorded' })).toHaveAttribute(
      'href',
      '/moh/audit?entry=SL-m3x9k2-ab12cd',
    );
  });

  it('asks the server for the filters in the address', async () => {
    const { requests } = renderApp(<SyncLogPage />, {
      route: `/moh/audit/sync-log?status=refused&action=stockout&user=${GRACE}`,
      signedIn: true,
      replies: [api],
    });

    // The action filter names the action too, so wait for a row.
    expect(await screen.findAllByText('grace.vht')).not.toHaveLength(0);
    const sent = query(requests[0]);
    expect(sent.get('status')).toBe('refused');
    expect(sent.get('action')).toBe('stockout');
    expect(sent.get('user_id')).toBe(GRACE);
    expect(screen.getByText('Saved by grace.vht')).toBeInTheDocument();
    const statuses = screen.getByRole('navigation', { name: 'Filter by status' });
    expect(within(statuses).getByRole('link', { name: 'Refused' })).toHaveAttribute(
      'aria-current',
      'true',
    );
  });

  it("shows one user's entries from the row menu", async () => {
    const user = userEvent.setup();
    renderApp(<SyncLogPage />, {
      route: '/moh/audit/sync-log',
      signedIn: true,
      replies: [api],
    });
    await screen.findAllByText('grace.vht');

    const [menu] = screen.getAllByRole('button', {
      name: 'Actions for hotspot mapped by grace.vht',
    });
    await user.click(menu!);
    await user.click(
      await screen.findByRole('menuitem', { name: 'Show entries saved by grace.vht' }),
    );
    expect(testRouter.location).toBe(`/moh/audit/sync-log?user=${GRACE}`);
  });

  it('offers the audit log only to people who may read it', async () => {
    const user = userEvent.setup();
    renderApp(<SyncLogPage />, {
      route: '/moh/audit/sync-log',
      session: sessionWith(ADMIN_PERMISSIONS.filter((code) => code !== 'audit:read')),
      replies: [api],
    });
    await screen.findAllByText('grace.vht');
    await user.click(
      screen.getByRole('button', { name: /^Show tries of hotspot mapped by grace\.vht/ }),
    );
    expect(
      screen.queryByRole('link', { name: 'What the server recorded' }),
    ).not.toBeInTheDocument();
  });

  it('explains an empty log', async () => {
    renderApp(<SyncLogPage />, {
      route: '/moh/audit/sync-log',
      signedIn: true,
      replies: [reply([])],
    });
    expect(await screen.findByText('No phone has reported yet')).toBeInTheDocument();
  });
});
