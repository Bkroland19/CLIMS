import { describe, expect, it } from 'vitest';

import type { OrderEvent } from './api';
import { orderHistory } from './history';

const event = (id: string, action: string, fields: Partial<OrderEvent> = {}): OrderEvent => ({
  id,
  order_id: 'order',
  actor_id: 'someone',
  action,
  status: 'queued',
  created_at: `2026-11-2${id}T08:00:00Z`,
  ...fields,
});

const at = (iso: string) => iso.slice(0, 10);

describe('orderHistory', () => {
  it('reads an alert oldest first, with "You" for the signed-in user', () => {
    const entries = orderHistory(
      'alert',
      [
        event('2', 'request-replenishment', { actor_id: 'me', status: 'on_hold' }),
        event('1', 'stockout_reported'),
      ],
      'me',
      at,
    );
    expect(entries).toEqual([
      {
        id: '1',
        text: 'Stockout reported',
        meta: 'Hotspot manager or VHT · 2026-11-21',
        role: 'hotspot-manager',
      },
      {
        id: '2',
        text: 'Asked the warehouse for stock; the alert waits on hold',
        meta: 'You · District focal person · 2026-11-22',
        role: 'dcfp',
      },
    ]);
  });

  it("reads a request's stock check by its outcome", () => {
    const [short, confirmed] = orderHistory(
      'request',
      [
        event('1', 'check-stock', { status: 'on_hold' }),
        event('2', 'check-stock', { status: 'confirmed' }),
      ],
      null,
      at,
    );
    expect(short?.text).toBe('The warehouse is short of stock; the request waits');
    expect(confirmed?.text).toBe('The warehouse confirmed the stock');
    expect(confirmed?.meta).toBe('Warehouse · 2026-11-22');
  });

  it('words a step it does not know from its action', () => {
    const [entry] = orderHistory('alert', [event('1', 'fulfill_order')], null, at);
    expect(entry).toMatchObject({ text: 'Fulfill order', role: 'system' });
  });
});
