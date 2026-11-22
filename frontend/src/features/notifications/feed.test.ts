import { describe, expect, it } from 'vitest';

import type { InboxNotification } from './api';
import { hrefFor, toAppNotification, unreadOfType } from './feed';

const notification = (overrides: Partial<InboxNotification> = {}): InboxNotification => ({
  id: 'n1',
  type: 'order.stockout_reported',
  title: 'Stockout at Kisenyi Landing',
  body: 'Kisenyi Landing is out of Engabu Free Female.',
  resource_type: 'hotspot',
  resource_id: 'h1',
  read_at: null,
  created_at: '2026-11-21T09:00:00Z',
  ...overrides,
});

describe('hrefFor', () => {
  it('opens the DCFP screen a notification is about', () => {
    expect(hrefFor(notification(), true)).toBe('/dcfp/stockouts');
    expect(
      hrefFor(
        notification({
          type: 'order.shipment_dispatched',
          resource_type: 'order',
          resource_id: 'o 1',
        }),
        true,
      ),
    ).toBe('/dcfp/restock/o%201');
    for (const type of ['order.replenishment_approved', 'order.replenishment_rejected']) {
      expect(hrefFor(notification({ type, resource_type: 'order', resource_id: 'o2' }), true)).toBe(
        '/dcfp/restock/o2',
      );
    }
    expect(hrefFor(notification({ type: 'hotspot.submitted' }), true)).toBe('/dcfp/hotspots');
  });

  it('gives no link where there is no screen to open', () => {
    // The warehouse's screens are not on the API yet; a VHT has no DCFP workspace.
    expect(hrefFor(notification({ type: 'order.replenishment_requested' }), true)).toBeNull();
    expect(hrefFor(notification({ type: 'hotspot.activated' }), true)).toBeNull();
    expect(hrefFor(notification(), false)).toBeNull();
  });
});

describe('toAppNotification and unreadOfType', () => {
  it('shows the body, with the title and time beneath, and keeps the read state', () => {
    expect(toAppNotification(notification(), true, () => '3 h ago')).toEqual({
      id: 'n1',
      text: 'Kisenyi Landing is out of Engabu Free Female.',
      meta: 'Stockout at Kisenyi Landing · 3 h ago',
      tone: 'negative',
      unread: true,
      href: '/dcfp/stockouts',
    });
    const read = toAppNotification(
      notification({ type: 'something.new', read_at: '2026-11-21T10:00:00Z' }),
      true,
      () => '',
    );
    expect(read).toMatchObject({ unread: false, tone: 'neutral', href: undefined });
  });

  it('counts unread notifications of one type', () => {
    const inbox = [
      notification(),
      notification({ id: 'n2', read_at: '2026-11-21T10:00:00Z' }),
      notification({ id: 'n3', type: 'hotspot.submitted' }),
    ];
    expect(unreadOfType(inbox, 'order.stockout_reported')).toBe(1);
  });
});
