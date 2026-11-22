import { describe, expect, it, vi } from 'vitest';

import type { HttpClient } from '@/lib/api';

import {
  getUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from './api';

function fakeHttp() {
  return {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  } as unknown as HttpClient & { get: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn> };
}

const notification = {
  id: 'n-1',
  type: 'order.stockout_reported',
  title: 'Stockout reported',
  body: 'Kasenyi Landing Site has run out of Engabu.',
  resource_type: 'order',
  resource_id: 'o-1',
  actor_id: 'u-1',
  data: { hot_spot_id: 'h-1' },
  read_at: null,
  created_at: '2026-11-21T08:00:00Z',
};

describe('notifications', () => {
  it('lists the newest, or only the unread ones', async () => {
    const http = fakeHttp();
    http.get.mockResolvedValue({ success: true, data: [notification] });

    expect(await listNotifications(http)).toEqual([notification]);
    await listNotifications(http, { unread: true });

    expect(http.get).toHaveBeenNthCalledWith(1, '/notifications?limit=50', { signal: undefined });
    expect(http.get).toHaveBeenNthCalledWith(2, '/notifications?limit=50&unread=true', {
      signal: undefined,
    });
  });

  it('reads the unread count and marks notifications read', async () => {
    const http = fakeHttp();
    // The client unwraps the `{ success, data }` envelope before a single record is parsed.
    http.get.mockResolvedValue({ unread: 3 });
    http.post
      .mockResolvedValueOnce({ success: true, message: 'notification marked read' })
      .mockResolvedValueOnce({ marked: 2 });

    expect(await getUnreadCount(http)).toBe(3);
    await markNotificationRead(http, 'n-1');
    expect(await markAllNotificationsRead(http)).toBe(2);

    expect(http.post).toHaveBeenNthCalledWith(1, '/notifications/n-1/read');
    expect(http.post).toHaveBeenNthCalledWith(2, '/notifications/read-all');
  });
});
