import { describe, expect, it } from 'vitest';

import { anOrder, aReport, DISTRICT_STORE, JMS, NMS } from '@/test/dcfpFixtures';

import {
  contactOf,
  dcfpCounts,
  dcfpTasks,
  DCFP_PATHS,
  orderSteps,
  parseCount,
  placeOf,
  receiptErrors,
  recentReports,
  warehouseLabel,
  warehouseOrders,
} from './orders';

describe('warehouseOrders', () => {
  it('keeps orders to NMS or JMS, leaving out alert orders and generic requests', () => {
    const orders = [
      anOrder({ id: 'nms' }),
      anOrder({ id: 'jms', ordered_from_store_id: JMS.id, order_status: 'dispatched' }),
      anOrder({ id: 'legacy-alert', hot_spot_id: 'h1', ordered_from_store_id: NMS.id }),
      anOrder({ id: 'generic', order_status: 'pending' }),
      anOrder({ id: 'district', ordered_from_store_id: DISTRICT_STORE }),
    ];
    expect(warehouseOrders(orders, [NMS, JMS]).map((order) => order.id)).toEqual(['nms', 'jms']);
  });
});

describe('warehouseLabel', () => {
  it('uses the short name for NMS and JMS and the name for anything else', () => {
    expect(warehouseLabel(NMS)).toBe('NMS');
    expect(warehouseLabel({ ...NMS, code: 'other', name: 'Regional store' })).toBe(
      'Regional store',
    );
    expect(warehouseLabel(undefined)).toBe('Warehouse');
  });
});

describe('orderSteps', () => {
  const states = (status: Parameters<typeof orderSteps>[0]) =>
    orderSteps(status).map((s) => s.state);

  it('marks steps done up to the status, and the next as current', () => {
    expect(states('queued')).toEqual(['done', 'current', 'upcoming', 'upcoming', 'upcoming']);
    expect(states('confirmed')).toEqual(['done', 'done', 'done', 'current', 'upcoming']);
    expect(states('received')).toEqual(['done', 'done', 'done', 'done', 'done']);
  });

  it('flags the stock check while the warehouse waits for stock', () => {
    const steps = orderSteps('on_hold');
    expect(steps.map((s) => s.state)).toEqual([
      'done',
      'done',
      'attention',
      'upcoming',
      'upcoming',
    ]);
    expect(steps[2]?.label).toBe('Waiting for stock');
  });

  it('stops a rejected order at the warehouse’s decision', () => {
    expect(orderSteps('rejected').map((s) => [s.label, s.state])).toEqual([
      ['Sent to warehouse', 'done'],
      ['Rejected', 'attention'],
    ]);
  });
});

describe('parseCount and receiptErrors', () => {
  it('accepts whole numbers only', () => {
    expect(parseCount(' 500 ')).toBe(500);
    expect(parseCount('0')).toBe(0);
    for (const bad of ['', '-1', '2.5', '1e3', 'ten', '99999999999999999999']) {
      expect(parseCount(bad)).toBeNull();
    }
  });

  it('needs a note only when the count differs from what was dispatched', () => {
    expect(receiptErrors('500', 500, '')).toEqual({});
    expect(receiptErrors('480', 500, '  ').note).toMatch(/differs/);
    expect(receiptErrors('480', 500, 'Two cartons damaged')).toEqual({});
    expect(receiptErrors('lots', 500, '').quantity).toMatch(/whole number/);
  });
});

describe('placeOf and contactOf', () => {
  it('joins the details the hotspot has', () => {
    expect(placeOf(aReport())).toBe('Kisenyi, Central, Kampala');
    expect(contactOf(aReport())).toBe('Peter Okello · 0700123456');
    const bare = aReport({
      hot_spot: {
        name: 'Bar 7',
        village: null,
        subcounty: ' ',
        district: 'Gulu',
        contact_name: null,
        contact_phone: null,
      },
    });
    expect(placeOf(bare)).toBe('Gulu');
    expect(contactOf(bare)).toBe('');
  });
});

describe('dcfpTasks', () => {
  const now = new Date('2026-11-21T12:00:00Z');
  const names = { product: () => 'Engabu Free Female', warehouse: () => 'NMS' };
  const time = (iso: string) => iso.slice(0, 10);

  it('puts receipts first, then the week’s unanswered stockouts', () => {
    const tasks = dcfpTasks(
      [aReport(), aReport({ id: 'old', created_at: '2026-11-01T00:00:00Z' })],
      // Ordered before the report came in, so the report still needs answering.
      [anOrder({ id: 'arrived', order_status: 'dispatched', created_at: '2026-11-15T08:00:00Z' })],
      names,
      now,
      time,
    );
    expect(tasks.map((task) => task.id)).toEqual(['receive-arrived', 'stockout-r1']);
    expect(tasks[0]?.href).toBe(DCFP_PATHS.order('arrived'));
    expect(tasks[1]).toMatchObject({
      action: 'Order stock',
      href: DCFP_PATHS.newOrderFor('female'),
      title: 'Kisenyi Landing is out of female condoms',
    });
    expect(tasks[1]?.detail).toContain('Dispenser empty since Monday');
  });

  it('drops a stockout once its condom type has been ordered since it was reported', () => {
    const answered = anOrder({ created_at: '2026-11-21T09:00:00Z', order_status: 'queued' });
    const earlier = anOrder({ id: 'earlier', created_at: '2026-11-20T09:00:00Z' });
    const otherType = anOrder({ ...answered, id: 'male', condom_category: 'male' });
    expect(dcfpTasks([aReport()], [answered], names, now, time)).toEqual([]);
    expect(dcfpTasks([aReport()], [earlier], names, now, time)).toHaveLength(1);
    expect(dcfpTasks([aReport()], [otherType], names, now, time)).toHaveLength(1);
    // Male and female: an order of either type answers it.
    expect(dcfpTasks([aReport({ selection: 'both' })], [otherType], names, now, time)).toEqual([]);
  });
});

describe('recentReports and dcfpCounts', () => {
  it('counts the week’s reports, stock to receive and unread stockouts', () => {
    const now = new Date('2026-11-21T12:00:00Z');
    expect(
      recentReports([aReport(), aReport({ created_at: '2026-11-13T00:00:00Z' })], now),
    ).toHaveLength(1);
    const counts = dcfpCounts(
      [
        anOrder({ order_status: 'dispatched' }),
        anOrder({ order_status: 'dispatched', hot_spot_id: 'h1' }),
        anOrder({ order_status: 'queued' }),
      ],
      3,
    );
    expect(counts).toEqual({ [DCFP_PATHS.orders]: 1, [DCFP_PATHS.stockouts]: 3 });
  });
});
