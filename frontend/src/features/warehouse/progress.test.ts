import { describe, expect, it } from 'vitest';

import { aRequest, DISPATCH_DETAILS } from '@/test/fulfilmentFixtures';

import type { WarehouseBatch } from './api';
import { checkRequestStock } from './dispatch';
import { requestBanner, warehouseSteps } from './progress';

const NOW = new Date('2026-11-20T09:00:00Z');
const BATCHES: WarehouseBatch[] = [
  {
    product: 'male',
    batch: 'ENG-2409-117',
    manufactured_on: '2024-09-23',
    expires_on: '2029-08-31',
    quantity: 5000,
  },
  {
    product: 'female',
    batch: 'FC2-2408-044',
    manufactured_on: '2024-08-05',
    expires_on: '2029-07-31',
    quantity: 1000,
  },
];

const states = (steps: ReturnType<typeof warehouseSteps>) =>
  Object.fromEntries(steps.map((step) => [step.id, step.state]));

describe('warehouseSteps', () => {
  it('starts at review for a new request', () => {
    expect(states(warehouseSteps(aRequest({ status: 'sent' }), null, NOW))).toEqual({
      review: 'current',
      queue: 'upcoming',
      check: 'upcoming',
      dispatch: 'upcoming',
      received: 'upcoming',
    });
  });

  it('moves to the stock check once queued, then to dispatch when stock is available', () => {
    const queued = aRequest({ status: 'queued', items: { male: 4000, female: 200 } });
    expect(states(warehouseSteps(queued, null, NOW)).check).toBe('current');
    const available = warehouseSteps(queued, checkRequestStock(queued.items, BATCHES, NOW), NOW);
    expect(states(available)).toMatchObject({ check: 'done', dispatch: 'current' });
    expect(available.find((step) => step.id === 'check')?.detail).toBe('Available');
  });

  it('flags the stock check when stock is short or the request is on hold', () => {
    const short = aRequest({ status: 'queued', items: { male: 9000, female: 0 } });
    expect(
      states(warehouseSteps(short, checkRequestStock(short.items, BATCHES, NOW), NOW)).check,
    ).toBe('attention');
    const held = warehouseSteps(aRequest({ status: 'on_hold' }), null, NOW);
    expect(states(held).check).toBe('attention');
    expect(held.find((step) => step.id === 'check')?.detail).toBe('Not available');
  });

  it('waits for the district once dispatched, and finishes when received', () => {
    const dispatched = aRequest({ status: 'dispatched', dispatch: DISPATCH_DETAILS });
    expect(states(warehouseSteps(dispatched, null, NOW))).toMatchObject({
      dispatch: 'done',
      received: 'current',
    });
    expect(states(warehouseSteps({ ...dispatched, status: 'received' }, null, NOW)).received).toBe(
      'done',
    );
  });
});

describe('requestBanner', () => {
  it('names the shortfall when stock is short', () => {
    const request = aRequest({ status: 'queued', items: { male: 9000, female: 0 } });
    const banner = requestBanner(request, checkRequestStock(request.items, BATCHES, NOW), NOW);
    expect(banner).toMatchObject({ variant: 'warning' });
    expect(banner.body).toBe(
      'Male condoms: 5,000 dispatchable, 9,000 needed. Put the request on hold.',
    );
  });

  it('gives the hold reason for a held request', () => {
    const banner = requestBanner(
      aRequest({ status: 'on_hold', hold_reason: 'Awaiting supplier delivery' }),
      null,
      NOW,
    );
    expect(banner.title).toBe('On hold: awaiting supplier delivery');
  });

  it('gives the waybill once dispatched', () => {
    const banner = requestBanner(
      aRequest({ status: 'dispatched', dispatch: DISPATCH_DETAILS }),
      null,
      NOW,
    );
    expect(banner.body).toBe(
      'Waybill WB-NMS-26-1187 · UBF 903T. Waiting for Wakiso to receive and verify.',
    );
  });
});
