import { describe, expect, it } from 'vitest';

import { alert, balance, FEMALE, MALE, request } from '@/test/districtFixtures';

import {
  alertStatus,
  availableFor,
  canSendNow,
  formatQuantity,
  kindOf,
  requestFor,
  requestStatus,
  sendableHeld,
} from './orders';

describe('kindOf', () => {
  it('tells alerts, warehouse requests and legacy store orders apart', () => {
    expect(kindOf(alert('a-1'))).toBe('alert');
    expect(kindOf(request('r-1', 'a-1'))).toBe('request');
    expect(kindOf(alert('o-1', { hot_spot_id: null }))).toBe('other');
  });
});

describe('statuses', () => {
  it('words an alert and a request in the district’s terms', () => {
    expect(alertStatus('on_hold')).toEqual({ label: 'Waiting for warehouse', tone: 'caution' });
    expect(requestStatus('dispatched')).toEqual({ label: 'In transit', tone: 'info' });
    expect(requestStatus('received')).toEqual({ label: 'Received', tone: 'positive' });
  });

  it('falls back to the status in plain words for one without a label', () => {
    expect(alertStatus('fulfilled')).toEqual({ label: 'Fulfilled', tone: 'neutral' });
    expect(requestStatus('pending')).toEqual({ label: 'Pending', tone: 'neutral' });
  });
});

describe('availableFor', () => {
  it('adds the product’s available stock over every unit, ignoring other products', () => {
    const stock = [
      balance({ available: 4 }),
      balance({ unit_of_measure_id: 'unit-carton', available: 2 }),
      balance({ condom_id: FEMALE, available: 50 }),
    ];

    expect(availableFor(stock, MALE)).toBe(6);
    expect(availableFor(stock, 'product-none')).toBe(0);
  });

  it('does not let a negative balance cancel out stock held in another unit', () => {
    const stock = [
      balance({ available: 3 }),
      balance({ unit_of_measure_id: 'u-2', available: -5 }),
    ];

    expect(availableFor(stock, MALE)).toBe(3);
  });
});

describe('canSendNow', () => {
  const held = alert('a-1', { order_status: 'on_hold' });

  it('is true for a held alert whose product is available', () => {
    expect(canSendNow(held, [balance({ available: 1 })])).toBe(true);
  });

  it('is false while nothing of the product is available', () => {
    expect(canSendNow(held, [balance({ available: 0, on_hand: 5, reserved: 5 })])).toBe(false);
    expect(canSendNow(held, [balance({ condom_id: FEMALE })])).toBe(false);
  });

  it('is false for an alert that is not on hold, and for a held warehouse request', () => {
    const stock = [balance()];

    expect(canSendNow(alert('a-2'), stock)).toBe(false);
    expect(canSendNow(request('r-1', 'a-1', { order_status: 'on_hold' }), stock)).toBe(false);
  });

  it('picks the sendable ones out of a list', () => {
    const orders = [held, alert('a-3', { order_status: 'on_hold', condom_id: FEMALE })];

    expect(sendableHeld(orders, [balance()]).map((order) => order.id)).toEqual(['a-1']);
  });
});

describe('requestFor', () => {
  it('finds the open request made for an alert before any received one', () => {
    const orders = [
      request('r-old', 'a-1', { order_status: 'received', created_at: '2026-11-21T00:00:00Z' }),
      request('r-open', 'a-1', { order_status: 'dispatched', created_at: '2026-11-20T00:00:00Z' }),
      request('r-other', 'a-2'),
    ];

    expect(requestFor('a-1', orders)?.id).toBe('r-open');
  });

  it('falls back to the most recent request, or none', () => {
    const orders = [
      request('r-1', 'a-1', { order_status: 'received', created_at: '2026-11-19T00:00:00Z' }),
      request('r-2', 'a-1', { order_status: 'received', created_at: '2026-11-20T00:00:00Z' }),
    ];

    expect(requestFor('a-1', orders)?.id).toBe('r-2');
    expect(requestFor('a-9', orders)).toBeNull();
  });
});

describe('formatQuantity', () => {
  it('shows the quantity with its unit, or says there is none yet', () => {
    expect(formatQuantity(1200, 'Box')).toBe('1,200 × Box');
    expect(formatQuantity(5, null)).toBe('5');
    expect(formatQuantity(null, 'Box')).toBe('No quantity yet');
  });
});
