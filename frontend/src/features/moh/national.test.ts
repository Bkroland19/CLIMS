import { describe, expect, it } from 'vitest';

import { filterFrom } from '@/features/fulfilment/orderFilters';
import { aRequest } from '@/test/fulfilmentFixtures';

import type { NationalSummary } from './api';
import { listHref, REQUEST_FILTERS } from './filters';
import { districtStockStatus, openOrders, ordersByStage, warehouseTotals } from './national';

const byStatus: NationalSummary['orders_by_status'] = {
  queued: 3,
  on_hold: 4,
  confirmed: 2,
  dispatched: 1,
  in_transit: 2,
  delivered: 1,
  received: 21,
};

describe('ordersByStage', () => {
  it('groups statuses into the stages an order moves through', () => {
    expect(ordersByStage(byStatus).map(({ label, value }) => [label, value])).toEqual([
      ['In queue', 3],
      ['On hold', 4],
      ['Confirmed', 2],
      ['With rider', 3],
      ['Delivered, unconfirmed', 1],
      ['Received', 21],
    ]);
  });
});

describe('openOrders', () => {
  it('counts every order not yet received, and those on hold', () => {
    expect(openOrders(byStatus)).toEqual({ open: 13, onHold: 4 });
  });
});

describe('warehouseTotals', () => {
  it('adds both products at every warehouse', () => {
    expect(
      warehouseTotals([
        { warehouse: 'NMS', stock: { male: 512_000, female: 38_400 } },
        { warehouse: 'JMS', stock: { male: 162_000, female: 12_600 } },
      ]),
    ).toEqual({
      total: 725_000,
      byWarehouse: [
        { warehouse: 'NMS', pieces: 550_400 },
        { warehouse: 'JMS', pieces: 174_600 },
      ],
    });
  });
});

describe('districtStockStatus', () => {
  const minimum = { male: 5000, female: 300 };

  it('names a product that has run out, before anything else', () => {
    expect(districtStockStatus({ stock: { male: 100, female: 0 }, min_levels: minimum })).toEqual({
      label: 'Female stocked out',
      tone: 'negative',
    });
  });

  it('flags stock under the minimum level', () => {
    expect(
      districtStockStatus({ stock: { male: 3900, female: 400 }, min_levels: minimum }),
    ).toEqual({ label: 'Below minimum', tone: 'caution' });
  });

  it('is good news when every product is at or above its minimum', () => {
    expect(
      districtStockStatus({ stock: { male: 5000, female: 300 }, min_levels: minimum }),
    ).toEqual({ label: 'Above minimum', tone: 'positive' });
  });
});

describe('list filters', () => {
  it('reads the request status filter from the address, falling back to all', () => {
    expect(filterFrom(REQUEST_FILTERS, 'in_transit').value).toBe('in_transit');
    expect(filterFrom(REQUEST_FILTERS, null).value).toBe('all');
  });

  it('keeps the requests each filter names', () => {
    const waiting = filterFrom(REQUEST_FILTERS, 'waiting');
    expect(waiting.keeps(aRequest({ status: 'under_review' }))).toBe(true);
    expect(waiting.keeps(aRequest({ status: 'dispatched' }))).toBe(false);
  });

  it('writes filters into the address, leaving out the defaults', () => {
    expect(listHref('/moh/orders', {})).toBe('/moh/orders');
    expect(listHref('/moh/orders', { status: 'all', district: null })).toBe('/moh/orders');
    expect(listHref('/moh/orders', { status: 'on_hold', district: 'Gulu' })).toBe(
      '/moh/orders?status=on_hold&district=Gulu',
    );
    expect(listHref('/moh/orders/warehouse', { district: 'Fort Portal' })).toBe(
      '/moh/orders/warehouse?district=Fort+Portal',
    );
  });
});
