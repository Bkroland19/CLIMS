import { describe, expect, it } from 'vitest';

import { alert, balance, FEMALE, request } from '@/test/districtFixtures';

import { districtNames } from './names';
import { dcfpCounts, dcfpTasks, DCFP_PATHS } from './tasks';

const names = districtNames({
  hotspots: [
    { id: 'hotspot-kasenyi', name: 'Kasenyi Landing Site' },
    { id: 'hotspot-bwebajja', name: 'Bwebajja Nite Spot' },
  ],
  stores: [
    {
      id: 'store-nms',
      code: 'nms',
      name: 'National Medical Stores',
      store_type: 'national',
      district_id: null,
      district_name: null,
    },
  ],
});
const at = (iso: string | null) => `at ${iso ?? '?'}`;

describe('dcfpTasks', () => {
  it('lists the work in the order it needs doing', () => {
    const tasks = dcfpTasks(
      {
        queued: [
          alert('a-new', { created_at: '2026-11-21T09:00:00Z' }),
          alert('a-old', { hot_spot_id: 'hotspot-bwebajja', created_at: '2026-11-19T09:00:00Z' }),
          request('r-queued', 'a-held'),
        ],
        onHold: [alert('a-held', { order_status: 'on_hold' })],
        dispatched: [
          request('r-1', 'a-held', { order_status: 'dispatched', quantity_issued: 18 }),
          alert('a-out', { order_status: 'dispatched' }),
        ],
        stock: [balance({ available: 5 })],
        submitted: [{ id: 'h-1', name: 'Kitoro Lodge' }],
      },
      names,
      at,
    );

    expect(tasks.map((task) => task.id)).toEqual([
      'decide-a-old',
      'decide-a-new',
      'send-held',
      'receive-r-1',
      'review-hotspots',
    ]);
    expect(tasks[0]).toMatchObject({
      title: 'Stockout at Bwebajja Nite Spot',
      detail: 'Unknown product · reported at 2026-11-19T09:00:00Z',
      href: DCFP_PATHS.alert('a-old'),
    });
    expect(tasks[2]).toMatchObject({
      title: 'Send 1 held alert',
      detail: 'Kasenyi Landing Site can now be supplied from the district store',
      href: DCFP_PATHS.held,
    });
    expect(tasks[3]).toMatchObject({
      title: 'Receive Unknown product from National Medical Stores',
      detail: '18 · sent at 2026-11-20T08:00:00Z',
      href: DCFP_PATHS.request('r-1'),
    });
    expect(tasks[4]).toMatchObject({ title: 'Review 1 submitted hotspot', detail: 'Kitoro Lodge' });
  });

  it('leaves out held alerts the store cannot cover yet', () => {
    const tasks = dcfpTasks(
      {
        onHold: [alert('a-held', { order_status: 'on_hold', condom_id: FEMALE })],
        stock: [balance()],
      },
      names,
      at,
    );

    expect(tasks).toEqual([]);
  });

  it('names a few hotspots and counts the rest', () => {
    const submitted = ['A', 'B', 'C', 'D', 'E'].map((name) => ({ id: name, name }));

    const [task] = dcfpTasks({ submitted }, names, at);

    expect(task).toMatchObject({
      title: 'Review 5 submitted hotspots',
      detail: 'A, B, C and 2 more',
    });
  });
});

describe('dcfpCounts', () => {
  it('counts what waits on each page', () => {
    expect(
      dcfpCounts({
        queued: [alert('a-1'), alert('a-2'), request('r-1', 'a-9')],
        onHold: [alert('a-3', { order_status: 'on_hold' })],
        dispatched: [request('r-2', 'a-3', { order_status: 'dispatched' }), alert('a-4')],
        stock: [balance()],
        submitted: [{ id: 'h-1', name: null }],
      }),
    ).toEqual({
      [DCFP_PATHS.queue]: 2,
      [DCFP_PATHS.held]: 1,
      [DCFP_PATHS.requests]: 1,
      [DCFP_PATHS.hotspots]: 1,
    });
  });

  it('leaves a count out until what it is counted from has loaded', () => {
    expect(dcfpCounts({ onHold: [alert('a-3', { order_status: 'on_hold' })] })).toEqual({});
  });
});
