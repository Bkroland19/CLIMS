import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { RecordedRequest } from '@/test/fakeAdapter';
import { testRouter } from '@/test/navigation';
import { renderApp } from '@/test/renderApp';

import AuditLogPage, { auditFiltersFrom, auditHref } from './AuditLogPage';

const entries = [
  {
    id: 'a-1',
    at: '2026-11-20T07:12:00Z',
    actor: 'Sarah Namubiru',
    action: 'updated',
    record_type: 'order',
    record_id: 'ORD-1042',
    summary: 'Confirmed the order',
    changes: [{ field: 'order_status', old: 'review', new: 'confirmed' }],
    source: 'Chrome on Android',
  },
  {
    id: 'a-2',
    at: '2026-11-14T07:22:00Z',
    actor: 'Ruth Akello',
    action: 'created',
    record_type: 'user',
    record_id: 'Grace Nakato',
    summary: 'Created as hotspot manager',
    changes: [],
    source: null,
  },
];

/** Answers like the server: applies the `record_type` and `action` filters in the query. */
function api(request: RecordedRequest) {
  const query = new URLSearchParams(request.url.split('?')[1] ?? '');
  const type = query.get('record_type');
  const action = query.get('action');
  return {
    status: 200,
    body: {
      success: true,
      data: entries.filter(
        (entry) => (!type || entry.record_type === type) && (!action || entry.action === action),
      ),
    },
  };
}

describe('audit log filters', () => {
  it('reads only known filters from the address', () => {
    expect(auditFiltersFrom(new URLSearchParams('type=user&action=deleted'))).toEqual({
      recordType: 'user',
      action: 'deleted',
    });
    expect(auditFiltersFrom(new URLSearchParams('type=nonsense&action=DROP'))).toEqual({
      recordType: null,
      action: null,
    });
  });

  it('leaves defaults out of the address', () => {
    expect(auditHref({ recordType: null, action: null })).toBe('/moh/audit');
    expect(auditHref({ recordType: 'warehouse_order', action: 'updated' })).toBe(
      '/moh/audit?type=warehouse_order&action=updated',
    );
  });
});

describe('AuditLogPage', () => {
  it('lists every entry with who, what, when and the record, and expands to show what changed', async () => {
    const user = userEvent.setup();
    const { requests } = renderApp(<AuditLogPage />, {
      route: '/moh/audit',
      signedIn: true,
      replies: [api],
    });

    expect(await screen.findByText('Order ORD-1042')).toBeInTheDocument();
    expect(screen.getByText('User Grace Nakato')).toBeInTheDocument();
    expect(screen.getByText('2 entries')).toBeInTheDocument();
    expect(screen.getByText('Sample data')).toBeInTheDocument();
    expect(requests[0]?.url).toBe('/audit-log');

    await user.click(screen.getByText('Order ORD-1042'));
    const changes = screen.getByRole('table', { name: 'What changed on order ORD-1042' });
    expect(within(changes).getByText('confirmed')).toBeInTheDocument();
  });

  it('asks the server for the filters in the address', async () => {
    const { requests } = renderApp(<AuditLogPage />, {
      route: '/moh/audit?type=user&action=created',
      signedIn: true,
      replies: [api],
    });

    expect(await screen.findByText('User Grace Nakato')).toBeInTheDocument();
    expect(screen.queryByText('Order ORD-1042')).not.toBeInTheDocument();
    expect(requests[0]?.url).toBe('/audit-log?record_type=user&action=created');
    const actions = screen.getByRole('navigation', { name: 'Filter by action' });
    expect(within(actions).getByRole('link', { name: 'Created' })).toHaveAttribute(
      'aria-current',
      'true',
    );
  });

  it('puts an action filter in the address, keeping the record type', async () => {
    const user = userEvent.setup();
    const { requests } = renderApp(<AuditLogPage />, {
      route: '/moh/audit?type=order',
      signedIn: true,
      replies: [api],
    });
    await screen.findByText('Order ORD-1042');

    const actions = screen.getByRole('navigation', { name: 'Filter by action' });
    await user.click(within(actions).getByRole('link', { name: 'Deleted' }));

    expect(testRouter.location).toBe('/moh/audit?type=order&action=deleted');
    expect(await screen.findByText('No entries match these filters')).toBeInTheDocument();
    await waitFor(() => {
      expect(requests.at(-1)?.url).toBe('/audit-log?record_type=order&action=deleted');
    });
  });

  it('puts a record type in the address from the record menu', async () => {
    const user = userEvent.setup();
    renderApp(<AuditLogPage />, { route: '/moh/audit', signedIn: true, replies: [api] });
    await screen.findByText('User Grace Nakato');

    await user.click(screen.getByRole('button', { name: 'Actions for user Grace Nakato' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Show only users' }));

    expect(testRouter.location).toBe('/moh/audit?type=user');
  });

  it('clears the filters from the empty state', async () => {
    const user = userEvent.setup();
    renderApp(<AuditLogPage />, {
      route: '/moh/audit?action=deleted',
      signedIn: true,
      replies: [api],
    });

    await user.click(await screen.findByRole('button', { name: 'Clear filters' }));
    expect(testRouter.location).toBe('/moh/audit');
  });

  it('shows an error with a retry when the log cannot be loaded', async () => {
    renderApp(<AuditLogPage />, { signedIn: true, replies: [{ status: 500, body: {} }] });
    expect(await screen.findByRole('button', { name: /try again/i })).toBeInTheDocument();
  });
});
