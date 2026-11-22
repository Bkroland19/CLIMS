import { describe, expect, it } from 'vitest';

import type { Notification } from '@/features/notifications/api';
import { alert, request } from '@/test/districtFixtures';

import { activityOf, hotspotCoverage, stockoutsBySubcounty, weeklyAlerts } from './dashboard';

// A Friday; its week starts on Monday 16 November.
const NOW = new Date(2026, 10, 20, 12);
const at = (month: number, day: number) => new Date(2026, month - 1, day, 9).toISOString();

describe('weeklyAlerts', () => {
  it('counts alerts reported and delivered per week, oldest week first', () => {
    const rows = weeklyAlerts(
      [
        alert('a', { created_at: at(11, 16) }),
        alert('b', { created_at: at(11, 10), order_status: 'delivered', updated_at: at(11, 17) }),
        alert('old', { created_at: at(8, 1) }),
        request('r', 'a', { created_at: at(11, 18) }),
      ],
      NOW,
      3,
    );
    expect(rows.map((row) => row.values)).toEqual([
      { reported: 0, delivered: 0 },
      { reported: 1, delivered: 0 },
      { reported: 1, delivered: 1 },
    ]);
    expect(rows.at(-1)?.label).toBe('16 Nov');
  });
});

describe('stockoutsBySubcounty', () => {
  it('counts the last 30 days of alerts by sub-county, most first', () => {
    const counts = stockoutsBySubcounty(
      [
        alert('a', { hot_spot_id: 'h1', created_at: at(11, 19) }),
        alert('b', { hot_spot_id: 'h1', created_at: at(11, 2) }),
        alert('c', { hot_spot_id: 'h2', created_at: at(11, 18) }),
        alert('d', { hot_spot_id: 'gone', created_at: at(11, 18) }),
        alert('old', { hot_spot_id: 'h2', created_at: at(9, 1) }),
      ],
      [
        { id: 'h1', subcounty: { id: 's1', name: 'Kajjansi' } },
        { id: 'h2', subcounty: null },
      ],
      NOW,
    );
    // A tie reads alphabetically.
    expect(counts).toEqual([
      { label: 'Kajjansi', value: 2 },
      { label: 'Sub-county not recorded', value: 2 },
    ]);
  });
});

describe('hotspotCoverage', () => {
  it('counts hotspots supplied and hotspots waiting, once each', () => {
    const row = {
      hot_spot_name: null,
      district_id: null,
      condom_id: 'm',
      product: 'M',
      unit: null,
      unit_of_measure_id: null,
      delivered: 0,
      last_delivered_at: null,
      in_transit: 0,
      on_hold_requests: 0,
      last_stockout_at: at(11, 1),
    };
    expect(
      hotspotCoverage([
        { ...row, hot_spot_id: 'h1', deliveries: 2, open_alerts: 1 },
        { ...row, hot_spot_id: 'h1', deliveries: 1, open_alerts: 0 },
        { ...row, hot_spot_id: 'h2', deliveries: 0, open_alerts: 1 },
      ]),
    ).toEqual({ supplied: 1, waiting: 2 });
  });
});

describe('activityOf', () => {
  const notification = (type: string): Notification => ({
    id: 'n1',
    type,
    title: 'Title',
    body: 'Body',
    resource_type: type.split('.')[0] ?? null,
    resource_id: 'x1',
    actor_id: null,
    data: {},
    read_at: null,
    created_at: at(11, 20),
  });

  it('links each kind to the page that shows it', () => {
    expect(activityOf(notification('order.stockout_reported'))).toMatchObject({
      href: '/dcfp/orders/x1',
      role: 'hotspot-manager',
    });
    expect(activityOf(notification('order.shipment_dispatched')).href).toBe('/dcfp/restock/x1');
    expect(activityOf(notification('hotspot.submitted')).href).toBe('/dcfp/hotspots/x1');
    expect(activityOf(notification('user.created'))).toMatchObject({ href: null, role: 'system' });
  });
});
