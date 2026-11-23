import { describe, expect, it } from 'vitest';

import type { OrderStatus } from '@/features/orders/api';
import { NMS } from '@/test/dcfpFixtures';
import { aWarehouseOrder } from '@/test/warehouseOrderFixtures';

import {
  needsWarehouse,
  ordersAt,
  REQUEST_FILTERS,
  requestBanner,
  requestEventLabel,
  requestSteps,
  warehouseCounts,
} from './requests';

const quantity = (value: number | null) => (value === null ? '—' : `${String(value)} boxes`);

describe('ordersAt', () => {
  it('keeps the warehouse orders placed with the store', () => {
    const orders = [
      aWarehouseOrder({ id: 'mine' }),
      aWarehouseOrder({ id: 'other', ordered_from_store_id: 'w-jms' }),
      aWarehouseOrder({ id: 'alert', hot_spot_id: 'h1' }),
      aWarehouseOrder({ id: 'generic', order_status: 'pending' }),
    ];
    expect(ordersAt(orders, NMS.id).map((order) => order.id)).toEqual(['mine']);
  });
});

describe('the warehouse’s queue', () => {
  it('counts orders to decide, to finish checking and to dispatch', () => {
    const orders = (
      ['queued', 'reviewed', 'on_hold', 'confirmed', 'dispatched', 'rejected'] as const
    ).map((status) => aWarehouseOrder({ id: status, order_status: status }));
    expect(orders.filter(needsWarehouse).map((order) => order.id)).toEqual([
      'queued',
      'reviewed',
      'confirmed',
    ]);
    expect(Object.values(warehouseCounts(orders))).toEqual([3]);
    const filter = (value: string) => REQUEST_FILTERS.find((option) => option.value === value);
    expect(orders.filter(filter('queued')!.keeps).map((order) => order.id)).toEqual([
      'queued',
      'reviewed',
    ]);
    expect(orders.filter(filter('on_hold')!.keeps).map((order) => order.id)).toEqual(['on_hold']);
  });
});

describe('requestSteps', () => {
  const states = (status: OrderStatus) =>
    requestSteps(aWarehouseOrder({ order_status: status })).map((step) => step.state);

  it('flags the stock step while the order waits for stock', () => {
    expect(states('queued')).toEqual(['done', 'current', 'upcoming', 'upcoming', 'upcoming']);
    expect(states('on_hold')).toEqual(['done', 'done', 'attention', 'upcoming', 'upcoming']);
    expect(states('confirmed')).toEqual(['done', 'done', 'done', 'current', 'upcoming']);
    expect(states('received')).toEqual(['done', 'done', 'done', 'done', 'done']);
  });

  it('stops a rejected order at the decision', () => {
    expect(requestSteps(aWarehouseOrder({ order_status: 'rejected' })).map((s) => s.label)).toEqual(
      ['Order received', 'Rejected'],
    );
  });

  it('skips the decision and the reservation for stock sent without an order', () => {
    const sent = aWarehouseOrder({ order_status: 'dispatched', unrequested: true });
    expect(requestSteps(sent).map((s) => [s.label, s.state])).toEqual([
      ['Sent without an order', 'done'],
      ['District receipt', 'current'],
    ]);
    expect(requestBanner(sent, 'Wakiso', 'Female condoms', quantity).body).toMatch(
      /^Sent without an order from Wakiso\./,
    );
  });
});

describe('requestBanner', () => {
  it('says what comes next at each step', () => {
    const banner = (overrides: Parameters<typeof aWarehouseOrder>[0]) =>
      requestBanner(aWarehouseOrder(overrides), 'Wakiso', 'Female condoms', quantity);
    expect(banner({}).body).toContain('Wakiso ordered 500 boxes of female condoms');
    expect(banner({ order_status: 'on_hold', quantity_approved: 300 }).body).toContain(
      'to reserve 300 boxes',
    );
    expect(banner({ order_status: 'confirmed', quantity_approved: 300 }).title).toBe(
      '300 boxes reserved for Wakiso',
    );
    expect(
      banner({
        order_status: 'received',
        quantity_issued: 300,
        quantity_received: 290,
        discrepancy_note: 'Ten missing',
      }),
    ).toMatchObject({ variant: 'warning', body: 'Ten missing' });
    expect(
      banner({ order_status: 'rejected', rejection_reason: 'Held for a campaign' }),
    ).toMatchObject({
      variant: 'destructive',
      body: 'Held for a campaign',
    });
  });
});

describe('requestEventLabel', () => {
  it('reads each step from the warehouse’s side', () => {
    expect(requestEventLabel('check-stock', 'on_hold')).toBe('Stock checked: waiting for stock');
    expect(requestEventLabel('check-stock', 'confirmed')).toBe('Stock checked and reserved');
    expect(requestEventLabel('reject', 'rejected')).toBe('Rejected');
  });
});
