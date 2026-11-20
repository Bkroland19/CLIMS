import { describe, expect, it } from 'vitest';

import { anEvent, anOrder, aRequest, DISPATCH_DETAILS } from '@/test/fulfilmentFixtures';

import type { OrderDetail } from './api';
import {
  auditEntries,
  formatLeadTime,
  latestOpenOrder,
  orderExceptions,
  orderMetrics,
} from './audit';

const at = (iso: string) => new Date(iso);

function detail(overrides: Partial<OrderDetail> = {}): OrderDetail {
  return { order: anOrder(), warehouse_request: null, held_at: null, trail: [], ...overrides };
}

describe('formatLeadTime', () => {
  it('runs from the notification to confirmed receipt', () => {
    expect(
      formatLeadTime({ created_at: '2026-11-18T08:00:00Z', received_at: '2026-11-18T11:20:00Z' }),
    ).toBe('3 h 20 min');
  });

  it('has none while the order is open', () => {
    expect(formatLeadTime({ created_at: '2026-11-18T08:00:00Z', received_at: null })).toBe('—');
  });
});

describe('orderMetrics', () => {
  const now = at('2026-11-19T12:00:00Z');

  it('counts an open order’s time so far and says it was never held', () => {
    const metrics = orderMetrics(
      detail({ order: anOrder({ created_at: '2026-11-19T10:30:00Z' }) }),
      now,
    );
    expect(metrics).toEqual([
      { label: 'Requested', value: 'Male 800 · Female 40' },
      { label: 'Received at hotspot', value: '—' },
      { label: 'Lead time', value: '1 h 30 min so far' },
      { label: 'Time on hold', value: 'None' },
    ]);
  });

  it('ends a hold when the order was confirmed, and shows what the hotspot received', () => {
    const metrics = orderMetrics(
      detail({
        order: anOrder({
          status: 'received',
          approved: { male: 600, female: 40 },
          created_at: '2026-11-17T08:00:00Z',
          confirmed_at: '2026-11-18T08:00:00Z',
          received_at: '2026-11-18T14:00:00Z',
        }),
        held_at: '2026-11-17T09:00:00Z',
      }),
      now,
    );
    expect(metrics).toContainEqual({ label: 'Received at hotspot', value: 'Male 600 · Female 40' });
    expect(metrics).toContainEqual({ label: 'Lead time', value: '1 d 6 h' });
    expect(metrics).toContainEqual({ label: 'Time on hold', value: '23 h' });
  });

  it('keeps counting a hold that has not ended', () => {
    const metrics = orderMetrics(
      detail({
        order: anOrder({ status: 'on_hold', created_at: '2026-11-19T08:00:00Z' }),
        held_at: '2026-11-19T09:00:00Z',
      }),
      now,
    );
    expect(metrics).toContainEqual({ label: 'Time on hold', value: '3 h' });
  });
});

describe('orderExceptions', () => {
  it('reports a discrepancy found when the warehouse request was received', () => {
    const request = aRequest({
      status: 'received',
      dispatch: DISPATCH_DETAILS,
      receipt: {
        received_at: '2026-11-19T06:00:00Z',
        received_by: 'Sarah Namubiru',
        grn: 'GRN-WAK-2026-015',
        accepted: { male: 5880, female: 300 },
        store_after: { male: 7280, female: 360 },
        lines: [],
        discrepancy: { type: 'Damaged', note: 'One carton crushed.' },
      },
    });
    expect(orderExceptions(detail({ warehouse_request: request }))).toEqual([
      { title: 'WR-2026-0032 · Damaged', detail: 'One carton crushed.' },
    ]);
  });

  it('has none when nothing went wrong', () => {
    expect(orderExceptions(detail())).toEqual([]);
    expect(orderExceptions(detail({ warehouse_request: aRequest() }))).toEqual([]);
  });
});

describe('auditEntries', () => {
  const now = at('2026-11-19T12:00:00Z');

  it('lists the order’s and its request’s events oldest first, with who, role, when and the gap', () => {
    const entries = auditEntries(
      detail({
        order: anOrder({ id: 'ORD-0136', warehouse_request_id: 'WR-2026-0032' }),
        warehouse_request: aRequest(),
        trail: [
          anEvent({
            id: 'e3',
            at: '2026-11-19T09:30:00Z',
            actor: 'Paul Ssekandi',
            role: 'warehouse',
            role_label: 'NMS',
            text: 'Dispatched on waybill WB-NMS-26-1187',
            reference: 'WR-2026-0032',
          }),
          anEvent({ id: 'e1', at: '2026-11-19T07:00:00Z', reference: 'ORD-0136' }),
          anEvent({
            id: 'e2',
            at: '2026-11-19T07:45:00Z',
            actor: 'Sarah Namubiru',
            role: 'dcfp',
            role_label: 'DCFP',
            text: 'Put on hold — district stock not available',
            reference: 'ORD-0136',
          }),
          anEvent({ id: 'other', reference: 'ORD-0999' }),
        ],
      }),
      now,
    );

    expect(entries.map((entry) => entry.id)).toEqual(['e1', 'e2', 'e3']);
    expect(entries.map((entry) => entry.role)).toEqual(['hotspot-manager', 'dcfp', 'warehouse']);
    expect(entries[0]?.meta).toMatch(/^Grace Nakato · Hotspot manager · [^·]+$/);
    expect(entries[1]?.meta).toMatch(
      /^Sarah Namubiru · DCFP · [^·]+ · 45 min after the last step$/,
    );
    expect(entries[2]?.meta).toMatch(
      /^WR-2026-0032 · Paul Ssekandi · NMS · [^·]+ · 1 h 45 min after the last step$/,
    );
  });
});

describe('latestOpenOrder', () => {
  it('picks the newest order that is not yet closed', () => {
    const orders = [
      anOrder({ id: 'old', created_at: '2026-11-18T08:00:00Z' }),
      anOrder({ id: 'closed', status: 'received', created_at: '2026-11-19T11:00:00Z' }),
      anOrder({ id: 'new', status: 'on_hold', created_at: '2026-11-19T09:00:00Z' }),
    ];
    expect(latestOpenOrder(orders)?.id).toBe('new');
  });

  it('is null when every order is closed', () => {
    expect(latestOpenOrder([anOrder({ status: 'received' })])).toBeNull();
    expect(latestOpenOrder([])).toBeNull();
  });
});
