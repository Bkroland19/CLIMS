import { z } from 'zod';

import { parseBody, parseList, type HttpClient } from '@/lib/api';

/*
 * The signed-in user's inbox (`backend/internal/features/notifications`),
 * for every role. It replaces the deprecated `/orders/notifications` and
 * `/hotspots/notifications` feeds.
 *
 *   GET  /notifications?unread=&limit=&offset=   Notification[], newest first
 *   GET  /notifications/unread-count              { unread }
 *   POST /notifications/:id/read                  marks one read
 *   POST /notifications/read-all                  { marked }
 *
 * A DCFP receives `order.stockout_reported`, `order.shipment_received`,
 * `hotspot.submitted`, `hotspot.updated`, `hotspot.resubmitted` and
 * `hotspot.commented`.
 */

const notificationSchema = z.object({
  id: z.string().min(1),
  /** `area.event`, e.g. `hotspot.submitted`. */
  type: z.string(),
  title: z.string(),
  body: z.string(),
  /** What it is about, for opening it: `order`, `hotspot`, … */
  resource_type: z.string().nullable(),
  resource_id: z.string().nullable(),
  /** Whose action caused it. */
  actor_id: z.string().nullable(),
  /** Details that depend on the type. */
  data: z.record(z.string(), z.unknown()),
  read_at: z.string().nullable(),
  created_at: z.string(),
});

export type Notification = z.infer<typeof notificationSchema>;

const unreadCountSchema = z.object({ unread: z.number().int().nonnegative() });
const markedSchema = z.object({ marked: z.number().int().nonnegative() });

export const NOTIFICATION_PAGE_SIZE = 50;

/** The newest notifications, or only the unread ones. */
export async function listNotifications(
  http: HttpClient,
  { unread = false }: { unread?: boolean } = {},
  signal?: AbortSignal,
): Promise<Notification[]> {
  const query = new URLSearchParams({ limit: String(NOTIFICATION_PAGE_SIZE) });
  if (unread) query.set('unread', 'true');
  return parseList(
    notificationSchema,
    await http.get(`/notifications?${query}`, { signal }),
    'notifications',
  );
}

export async function getUnreadCount(http: HttpClient, signal?: AbortSignal): Promise<number> {
  return parseBody(
    unreadCountSchema,
    await http.get('/notifications/unread-count', { signal }),
    'unread count',
  ).unread;
}

export async function markNotificationRead(http: HttpClient, id: string): Promise<void> {
  await http.post(`/notifications/${encodeURIComponent(id)}/read`);
}

/** Marks every unread notification read and says how many there were. */
export async function markAllNotificationsRead(http: HttpClient): Promise<number> {
  return parseBody(markedSchema, await http.post('/notifications/read-all'), 'marked').marked;
}
