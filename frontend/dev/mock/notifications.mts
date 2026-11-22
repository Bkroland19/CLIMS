/**
 * The signed-in user's notification inbox for the mock API, on the Go API's paths, shapes and
 * rules (`backend/internal/features/notifications`, `docs/modules/notifications.md`):
 *
 *   GET  /notifications?limit=&offset=&unread=   newest first, 50 by default, at most 100
 *   GET  /notifications/unread-count              { unread }
 *   POST /notifications/:id/read                  marking it again changes nothing
 *   POST /notifications/read-all                  { marked }
 *
 * The mock has one recipient, the signed-in user, who works as Wakiso's DCFP. The order and
 * hotspot mocks add what the API would send that person: stockout alerts at their store,
 * shipments on the way to it, and hotspots submitted or commented on in their district. As in
 * the API, nobody is notified of a step they took themselves.
 */

import type { Reply } from './fulfilment.mts';

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  resource_type: string | null;
  resource_id: string | null;
  actor_id: string | null;
  data: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

/** One notification for the signed-in user, as a feature mock sends it. */
export interface MockNotification {
  /** `<feature>.<event>`, e.g. `order.stockout_reported`. */
  type: string;
  title: string;
  body: string;
  /** The record it is about, so the app can open it. */
  resource: { type: string; id: string } | null;
  actorId: string | null;
  /** The values the title and body were written from, stored with the notification. */
  data: Record<string, unknown>;
  /** When it was sent. */
  at: string;
  /** Seed data only: whether the user has already read it. */
  read?: boolean;
}

const state = { items: [] as Notification[], sequence: 0 };

const ok = (data: unknown, message: string): Reply => ({
  status: 200,
  body: { success: true, message, data },
});
const fail = (status: number, message: string): Reply => ({
  status,
  body: { success: false, message },
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isId = (value: string | undefined): value is string =>
  value !== undefined && UUID.test(value) && /[1-9a-f]/i.test(value.replaceAll('-', ''));

/** Empties the inbox. Call it before the order and hotspot mocks seed theirs. */
export function seedNotificationsMock(): void {
  state.items = [];
  state.sequence = 0;
}

/** Delivers a notification to the signed-in user. */
export function notify(message: MockNotification): void {
  state.sequence += 1;
  // A seeded notification that has been read was read an hour after it arrived, or just now.
  const readAt = Math.min(Date.parse(message.at) + 3_600_000, Date.now());
  state.items.push({
    id: `00000000-0000-4000-8300-${String(state.sequence).padStart(12, '0')}`,
    type: message.type,
    title: message.title,
    body: message.body,
    resource_type: message.resource?.type ?? null,
    resource_id: message.resource?.id ?? null,
    actor_id: message.actorId,
    data: message.data,
    read_at: message.read ? new Date(readAt).toISOString() : null,
    created_at: message.at,
  });
}

/** Newest first, as the API orders the inbox. */
function inbox(): Notification[] {
  return [...state.items].sort(
    (a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id),
  );
}

/** Go's `strconv.ParseBool`, which the API reads `unread` with. */
function parseBool(value: string): boolean | null {
  if (['1', 't', 'T', 'TRUE', 'true', 'True'].includes(value)) return true;
  if (['0', 'f', 'F', 'FALSE', 'false', 'False'].includes(value)) return false;
  return null;
}

function list(query: URLSearchParams): Reply {
  const limit = Number(query.get('limit') ?? 50);
  const offset = Number(query.get('offset') ?? 0);
  if (
    !Number.isInteger(limit) ||
    !Number.isInteger(offset) ||
    limit < 1 ||
    limit > 100 ||
    offset < 0
  ) {
    return fail(400, 'limit must be between 1 and 100 and offset must be nonnegative');
  }
  const unread = parseBool(query.get('unread') ?? 'false');
  if (unread === null) return fail(400, 'unread must be true or false');
  const items = inbox().filter((item) => !unread || item.read_at === null);
  return ok(items.slice(offset, offset + limit), 'notifications retrieved');
}

/** Answers `/notifications…`, or returns null for any other path. */
export function handleNotifications(
  method: string,
  parts: readonly string[],
  query: URLSearchParams,
): Reply | null {
  const [resource, first, second] = parts;
  if (resource !== 'notifications') return null;
  if (first === undefined) return method === 'GET' ? list(query) : fail(405, 'Method not allowed');
  if (first === 'unread-count' && second === undefined && method === 'GET') {
    const unread = state.items.filter((item) => item.read_at === null).length;
    return ok({ unread }, 'unread count retrieved');
  }
  if (first === 'read-all' && second === undefined && method === 'POST') {
    const now = new Date().toISOString();
    const unread = state.items.filter((item) => item.read_at === null);
    for (const item of unread) item.read_at = now;
    return ok({ marked: unread.length }, 'notifications marked read');
  }
  if (second === 'read' && parts.length === 3 && method === 'POST') {
    if (!isId(first)) return fail(400, 'id must be a nonzero UUID');
    const item = state.items.find((candidate) => candidate.id === first.toLowerCase());
    if (!item) return fail(404, 'notification not found');
    item.read_at ??= new Date().toISOString();
    // The API sends no data with this reply.
    return { status: 200, body: { success: true, message: 'notification marked read' } };
  }
  return fail(404, 'Not found');
}
