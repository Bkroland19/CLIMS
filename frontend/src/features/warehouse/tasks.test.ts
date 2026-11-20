import { describe, expect, it } from 'vitest';

import { aRequest } from '@/test/fulfilmentFixtures';

import type { WarehouseBatch } from './api';
import { parseStore, withStore } from './paths';
import {
  requestFilterFrom,
  reservedByOpenRequests,
  warehouseCounts,
  warehouseTasks,
} from './tasks';

const NOW = new Date('2026-11-20T09:00:00Z');
const time = (iso: string) => iso.slice(0, 10);

const REQUESTS = [
  aRequest({ id: 'WR-1', status: 'sent', district: 'Gulu', items: { male: 8000, female: 0 } }),
  aRequest({ id: 'WR-2', status: 'queued', district: 'Mukono' }),
  aRequest({
    id: 'WR-3',
    status: 'on_hold',
    district: 'Lira',
    hold_reason: 'Batch on quality hold',
  }),
  aRequest({ id: 'WR-4', status: 'dispatched', district: 'Jinja' }),
  aRequest({ id: 'WR-5', status: 'received', district: 'Masaka' }),
];

const batch = (name: string, expires_on: string): WarehouseBatch => ({
  product: 'male',
  batch: name,
  manufactured_on: '2022-01-01',
  expires_on,
  quantity: 1000,
});

describe('warehouseTasks', () => {
  it('lists review, dispatch and re-check tasks in that order, then stock problems', () => {
    const tasks = warehouseTasks(
      REQUESTS,
      [
        batch('ENG-OLD', '2026-01-31'),
        batch('ENG-SOON', '2027-02-28'),
        batch('ENG-OK', '2029-01-31'),
      ],
      NOW,
      time,
    );
    expect(tasks.map((task) => task.id)).toEqual([
      'review-WR-1',
      'dispatch-WR-2',
      'recheck-WR-3',
      'expired',
      'flagged',
    ]);
    expect(tasks[0]).toMatchObject({
      title: 'Review WR-1 from Gulu',
      detail: 'Male 8,000 · Sarah Namubiru · 2026-11-17',
      href: '/warehouse/requests/WR-1',
    });
    expect(tasks[2]?.detail).toContain('Batch on quality hold');
    expect(tasks[3]).toMatchObject({
      title: 'Remove 1 expired batch from stock',
      href: '/warehouse/stock',
    });
    expect(tasks[4]?.title).toBe('1 batch has under 6 months left');
  });

  it('has nothing to do when every request has gone out and stock is in date', () => {
    expect(warehouseTasks(REQUESTS.slice(3), [batch('ENG-OK', '2029-01-31')], NOW, time)).toEqual(
      [],
    );
  });
});

describe('request filters', () => {
  it('reads the filter from the address, defaulting to all', () => {
    expect(requestFilterFrom('new').value).toBe('new');
    expect(requestFilterFrom('nonsense').value).toBe('all');
    expect(requestFilterFrom(null).value).toBe('all');
  });

  it('keeps new requests in "new", whether or not they have been opened', () => {
    const filter = requestFilterFrom('new');
    expect(REQUESTS.filter(filter.keeps).map((request) => request.id)).toEqual(['WR-1']);
    expect(filter.keeps(aRequest({ status: 'under_review' }))).toBe(true);
  });
});

describe('counts and reservations', () => {
  it('counts requests waiting on the warehouse for the sidebar badge', () => {
    expect(warehouseCounts(REQUESTS)).toEqual({ '/warehouse/requests': 2 });
    expect(warehouseCounts(undefined)).toEqual({});
  });

  it('adds up what open requests still need', () => {
    expect(reservedByOpenRequests(REQUESTS)).toEqual({ male: 20000, female: 600 });
  });
});

describe('store in the address', () => {
  it('accepts only NMS or JMS', () => {
    expect(parseStore('JMS')).toBe('JMS');
    expect(parseStore('jms')).toBeNull();
    expect(parseStore(null)).toBeNull();
  });

  it('adds the store to a path, keeping its query', () => {
    expect(withStore('/warehouse/requests', 'JMS')).toBe('/warehouse/requests?store=JMS');
    expect(withStore('/warehouse/requests?status=new', 'NMS')).toBe(
      '/warehouse/requests?status=new&store=NMS',
    );
  });
});
