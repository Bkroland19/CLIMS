import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { RecordedRequest } from '@/test/fakeAdapter';
import { testRouter } from '@/test/navigation';
import { renderApp } from '@/test/renderApp';

import { actionLabel, auditQuery, NO_FILTERS, PAGE_SIZE, startOfDay, type AuditEntry } from './api';
import AuditLogPage from './AuditLogPage';
import { auditFiltersFrom, auditHref } from './links';

const HOTSPOT = '11111111-1111-4111-8111-111111111111';
const DISTRICT = '22222222-2222-4222-8222-222222222222';
const SARAH = '33333333-3333-4333-8333-333333333333';

const base: AuditEntry = {
  id: 'e-0',
  occurred_at: '2026-11-20T07:12:00Z',
  action: 'hotspot.activated',
  outcome: 'success',
  reason: null,
  actor: { id: SARAH, username: 'sarah.namubiru', roles: ['dfcp'] },
  system_actor: null,
  target: { type: 'hotspot', id: HOTSPOT },
  subjects: [
    { type: 'hotspot', id: HOTSPOT },
    { type: 'district', id: DISTRICT },
  ],
  changes: { review_status: { before: 'pending', after: 'approved' } },
  details: { comment: 'Visited on Monday' },
  ip_address: '41.210.1.2',
  user_agent:
    'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36',
  request_id: 'req-42',
  session_id: null,
};

const entries: AuditEntry[] = [
  base,
  {
    ...base,
    id: 'e-1',
    occurred_at: '2026-11-19T07:12:00Z',
    action: 'auth.login_failed',
    outcome: 'failure',
    reason: 'wrong_password',
    actor: null,
    target: null,
    subjects: [],
    changes: null,
    details: { identifier: 'grace' },
  },
];

const reply = (data: unknown) => ({ status: 200, body: { success: true, data } });

/** Answers like the server for the outcome filter; the rest is checked through the request URL. */
function api(request: RecordedRequest) {
  const query = new URLSearchParams(request.url.split('?')[1] ?? '');
  const outcome = query.get('outcome');
  return reply(entries.filter((entry) => !outcome || entry.outcome === outcome));
}

const query = (request: RecordedRequest | undefined) =>
  new URLSearchParams(request?.url.split('?')[1] ?? '');

describe('audit log filters', () => {
  it('reads only well-formed filters from the address', () => {
    expect(
      auditFiltersFrom(
        new URLSearchParams(
          `area=hotspots&outcome=failure&from=2026-11-01&to=2026-11-20&actor=${SARAH}&subject=hotspot:${HOTSPOT}`,
        ),
      ),
    ).toEqual({
      area: 'hotspots',
      outcome: 'failure',
      from: '2026-11-01',
      to: '2026-11-20',
      actor: SARAH,
      subject: { type: 'hotspot', id: HOTSPOT },
    });
    expect(
      auditFiltersFrom(
        new URLSearchParams('area=DROP&outcome=maybe&from=yesterday&actor=nope&subject=nope'),
      ),
    ).toEqual(NO_FILTERS);
  });

  it('leaves defaults out of the address', () => {
    expect(auditHref()).toBe('/moh/audit');
    expect(auditHref({ area: 'orders', subject: { type: 'order', id: 'o-1' } })).toBe(
      '/moh/audit?area=orders&subject=order%3Ao-1',
    );
  });

  it('asks the API for areas as domains, and hides reads of the log by default', () => {
    expect(auditQuery(NO_FILTERS).get('exclude_domain')).toBe('audit');
    expect(auditQuery({ ...NO_FILTERS, area: 'access' }).get('domain')).toBe('user,role,access');
    expect(auditQuery({ ...NO_FILTERS, area: 'audit' }).get('domain')).toBe('audit');
    expect(auditQuery({ ...NO_FILTERS, area: 'other' }).get('exclude_domain')).toContain(
      'auth,user,role',
    );
    expect(auditQuery(NO_FILTERS, 50).get('offset')).toBe('50');
  });

  it('sends whole local days, with the exclusive end on the day after', () => {
    const params = auditQuery({ ...NO_FILTERS, from: '2026-11-01', to: '2026-11-20' });
    expect(params.get('from')).toBe(startOfDay('2026-11-01'));
    expect(params.get('to')).toBe(new Date(2026, 10, 21).toISOString());
  });

  it('names known actions and reads unknown ones from their name', () => {
    expect(actionLabel('hotspot.activated')).toBe('Hotspot activated');
    expect(actionLabel('stock_batch.expired')).toBe('Stock batch expired');
  });
});

describe('AuditLogPage', () => {
  it('lists who did what to which record, and expands to show what changed and from where', async () => {
    const user = userEvent.setup();
    const { requests } = renderApp(<AuditLogPage />, {
      route: '/moh/audit',
      signedIn: true,
      replies: [api],
    });

    expect(await screen.findByText('sarah.namubiru')).toBeInTheDocument();
    expect(screen.getAllByText('Hotspot activated')).not.toHaveLength(0);
    expect(screen.getAllByText('Sign-in failed')).not.toHaveLength(0);
    expect(screen.getByText('Not signed in')).toBeInTheDocument();
    expect(screen.getByText('2 entries')).toBeInTheDocument();
    expect(screen.queryByText('Sample data')).not.toBeInTheDocument();
    expect(requests[0]?.url).toBe('/audit?exclude_domain=audit&limit=50');

    await user.click(screen.getByText('sarah.namubiru'));
    const changes = screen.getByRole('table', { name: 'What changed: hotspot activated' });
    expect(within(changes).getByText('approved')).toBeInTheDocument();
    expect(screen.getAllByText('41.210.1.2 · Chrome on Android')[0]).toBeVisible();
    expect(screen.getAllByText('Request req-42')[0]).toBeVisible();
  });

  it('asks the server for the filters in the address', async () => {
    const { requests } = renderApp(<AuditLogPage />, {
      route: `/moh/audit?area=hotspots&outcome=failure&subject=hotspot:${HOTSPOT}`,
      signedIn: true,
      replies: [api],
    });

    expect(await screen.findAllByText('Sign-in failed')).not.toHaveLength(0);
    const sent = query(requests[0]);
    expect(sent.get('domain')).toBe('hotspot');
    expect(sent.get('outcome')).toBe('failure');
    expect(sent.get('subject_type')).toBe('hotspot');
    expect(sent.get('subject_id')).toBe(HOTSPOT);
    expect(screen.getByText(`History of hotspot ${HOTSPOT.slice(0, 8)}`)).toBeInTheDocument();
    const outcomes = screen.getByRole('navigation', { name: 'Filter by outcome' });
    expect(within(outcomes).getByRole('link', { name: 'Failed' })).toHaveAttribute(
      'aria-current',
      'true',
    );
  });

  it("shows one record's history from the row menu", async () => {
    const user = userEvent.setup();
    renderApp(<AuditLogPage />, { route: '/moh/audit', signedIn: true, replies: [api] });
    await screen.findByText('sarah.namubiru');

    await user.click(screen.getAllByRole('button', { name: /^Actions for hotspot activated/ })[0]!);
    await user.click(await screen.findByRole('menuitem', { name: "Show this record's history" }));

    expect(testRouter.location).toBe(`/moh/audit?subject=hotspot%3A${HOTSPOT}`);
  });

  it('reads the next page on request, and stops after a short page', async () => {
    const user = userEvent.setup();
    const page = Array.from({ length: PAGE_SIZE }, (_, n) => ({ ...base, id: `p-${n}` }));
    const { requests } = renderApp(<AuditLogPage />, {
      route: '/moh/audit',
      signedIn: true,
      replies: [
        (request: RecordedRequest) =>
          reply(query(request).get('offset') ? [{ ...base, id: 'last' }] : page),
      ],
    });

    expect(await screen.findByText('50+ entries')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Load more' }));

    expect(await screen.findByText('51 entries')).toBeInTheDocument();
    expect(query(requests.at(-1)).get('offset')).toBe('50');
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
  });

  it('clears the filters from the empty state', async () => {
    const user = userEvent.setup();
    renderApp(<AuditLogPage />, {
      route: '/moh/audit?area=inventory',
      signedIn: true,
      replies: [reply([])],
    });

    await user.click(await screen.findByRole('button', { name: 'Clear filters' }));
    await waitFor(() => {
      expect(testRouter.location).toBe('/moh/audit');
    });
  });

  it('shows an error with a retry when the log cannot be loaded', async () => {
    renderApp(<AuditLogPage />, { signedIn: true, replies: [{ status: 500, body: {} }] });
    expect(await screen.findByRole('button', { name: /try again/i })).toBeInTheDocument();
  });
});
