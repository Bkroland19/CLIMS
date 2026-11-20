import { describe, expect, it } from 'vitest';

import { anOrder, aRequest, DISPATCH_DETAILS } from '@/test/fulfilmentFixtures';

import { dcfpCounts, dcfpTasks, orderHref, releasable } from './tasks';

const time = () => 'Today, 09:00';
const stock = { male: 1400, female: 60 };

describe('dcfpTasks', () => {
  it('lists the work in the order it needs doing', () => {
    const tasks = dcfpTasks(
      [
        anOrder({ id: 'ORD-5', status: 'confirmed', confirmed_at: '2026-11-19T06:00:00Z' }),
        anOrder({ id: 'ORD-4', status: 'on_hold', approved: { male: 100, female: 0 } }),
        anOrder({ id: 'ORD-3', status: 'on_hold', approved: { male: 9000, female: 0 } }),
        anOrder({ id: 'ORD-1', status: 'queued' }),
      ],
      [aRequest({ id: 'WR-9', status: 'dispatched', dispatch: DISPATCH_DETAILS })],
      stock,
      time,
    );

    expect(tasks.map((task) => task.title)).toEqual([
      'Review ORD-1 from Kasenyi Landing Site',
      'Request stock for 1 held order',
      'Receive WR-9 from NMS',
      'Release 1 held order',
      'Dispatch ORD-5 to Kasenyi Landing Site',
    ]);
    expect(tasks.map((task) => task.href)).toEqual([
      '/dcfp/orders/ORD-1',
      '/dcfp/restock/new?order=ORD-3',
      '/dcfp/restock/WR-9',
      '/dcfp/orders/held',
      '/dcfp/dispatch/ORD-5',
    ]);
    expect(tasks[2]?.detail).toBe('Male 6,000 · Female 300 · waybill WB-NMS-26-1187');
  });

  it('does not ask for stock for a held order that already has a request', () => {
    const tasks = dcfpTasks(
      [
        anOrder({
          status: 'on_hold',
          approved: { male: 9000, female: 0 },
          warehouse_request_id: 'WR-1',
        }),
      ],
      [],
      stock,
      time,
    );
    expect(tasks).toEqual([]);
  });
});

describe('releasable', () => {
  it('keeps held orders the store can cover in full, for every product', () => {
    const fits = anOrder({ id: 'A', status: 'on_hold', approved: { male: 1400, female: 60 } });
    const short = anOrder({ id: 'B', status: 'on_hold', approved: { male: 100, female: 61 } });
    const queued = anOrder({ id: 'C', status: 'queued', approved: { male: 1, female: 0 } });
    expect(releasable([fits, short, queued], stock).map((order) => order.id)).toEqual(['A']);
  });
});

describe('dcfpCounts', () => {
  it('counts what waits on each page', () => {
    expect(
      dcfpCounts(
        [
          anOrder({ status: 'queued' }),
          anOrder({ status: 'queued' }),
          anOrder({ status: 'confirmed' }),
          anOrder({ status: 'on_hold', approved: { male: 10, female: 0 } }),
        ],
        [aRequest({ status: 'dispatched' }), aRequest({ status: 'sent' })],
        stock,
      ),
    ).toEqual({
      '/dcfp/orders': 2,
      '/dcfp/dispatch': 1,
      '/dcfp/orders/held': 1,
      '/dcfp/restock': 1,
    });
  });

  it('leaves out what has not loaded', () => {
    expect(dcfpCounts(undefined, undefined, undefined)).toEqual({});
  });
});

describe('orderHref', () => {
  it('sends a confirmed order to its dispatch page and the rest to the order', () => {
    expect(orderHref({ id: 'ORD-1', status: 'confirmed' })).toBe('/dcfp/dispatch/ORD-1');
    expect(orderHref({ id: 'ORD-1', status: 'on_hold' })).toBe('/dcfp/orders/ORD-1');
  });
});
