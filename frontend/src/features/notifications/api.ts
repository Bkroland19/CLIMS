import { z } from 'zod';

import { parseList, type HttpClient } from '@/lib/api';

/*
 * The signed-in user's central inbox (`GET /api/v1/notifications`, docs/modules/notifications.md).
 * Every user reads only their own notifications; no permission is needed.
 */

const notificationSchema = z.object({
  id: z.string(),
  /** `<feature>.<event>`, e.g. `order.stockout_reported`. */
  type: z.string(),
  title: z.string(),
  body: z.string(),
  resource_type: z.string().nullable(),
  resource_id: z.string().nullable(),
  read_at: z.string().nullable(),
  created_at: z.string(),
});

export type InboxNotification = z.infer<typeof notificationSchema>;

/** How many of the newest notifications the bell lists. */
export const INBOX_SIZE = 50;

export async function listNotifications(
  http: HttpClient,
  signal?: AbortSignal,
): Promise<InboxNotification[]> {
  const body = await http.get(`/notifications?limit=${INBOX_SIZE}`, { signal });
  return parseList(notificationSchema, body, 'notifications');
}

export async function markNotificationRead(http: HttpClient, id: string): Promise<void> {
  await http.post(`/notifications/${encodeURIComponent(id)}/read`);
}

export async function markAllNotificationsRead(http: HttpClient): Promise<void> {
  await http.post('/notifications/read-all');
}
