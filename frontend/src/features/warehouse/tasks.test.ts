import { describe, expect, it } from 'vitest';

import { aStockBatch, aWarehouseOrder } from '@/test/warehouseOrderFixtures';

import { warehouseTasks, type TaskNames } from './tasks';

const names: TaskNames = {
  store: (id) => (id === 'store-gulu' ? 'Gulu' : 'Wakiso'),
  product: (id, category) => (id ? 'Engabu · Male · Free' : `${String(category)} condoms`),
  quantity: (value) => `${String(value)} boxes`,
};

describe('warehouseTasks', () => {
  it('lists orders to decide, reserve, dispatch and recheck, then batches to deal with', () => {
    const orders = [
      aWarehouseOrder({ id: 'held', order_status: 'on_hold', quantity_approved: 200 }),
      aWarehouseOrder({ id: 'new', ordered_for_store_id: 'store-gulu' }),
      aWarehouseOrder({
        id: 'go',
        order_status: 'confirmed',
        condom_id: 'p1',
        quantity_approved: 300,
      }),
      aWarehouseOrder({ id: 'seen', order_status: 'reviewed', quantity_approved: 100 }),
      aWarehouseOrder({ id: 'done', order_status: 'received' }),
    ];
    const batches = [
      aStockBatch({ id: 'b1', batch_number: 'EXP-1', band: 'expired', on_hand: 5 }),
      aStockBatch({ id: 'b2', batch_number: 'NEAR-1', band: 'under_1_month' }),
      aStockBatch({ id: 'b3', batch_number: 'SOON-1', band: 'under_3_months' }),
      aStockBatch({ id: 'b4', batch_number: null, band: 'unknown', on_hand: 20 }),
      aStockBatch({ id: 'b5', band: 'ok' }),
    ];
    const tasks = warehouseTasks(orders, batches, names, () => 'today');
    expect(tasks.map((task) => task.id)).toEqual([
      'decide-new',
      'reserve-seen',
      'dispatch-go',
      'recheck-held',
      'expired',
      'under-1-month',
      'under-3-months',
      'recount',
    ]);
    expect(tasks[0]).toMatchObject({
      title: "Decide on Gulu's order for 500 boxes",
      detail: 'female condoms · received today',
      href: '/warehouse/requests/new',
    });
    expect(tasks[2]?.title).toBe('Dispatch 300 boxes to Wakiso');
    expect(tasks[4]).toMatchObject({
      detail: "EXP-1 · 5 can't be dispatched",
      href: '/warehouse/stock?band=expired',
    });
  });

  it('has nothing to do for a quiet warehouse', () => {
    expect(warehouseTasks([], [aStockBatch()], names, () => '')).toEqual([]);
  });
});
