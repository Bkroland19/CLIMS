import { api } from "./api";
import type { AppEvent, AppRole, EventRole } from "./types";

/**
 * The signed-in user's inbox from the Go API (docs/modules/notifications.md): `GET /notifications`,
 * `POST /notifications/{id}/read` and `POST /notifications/read-all`. The server writes each
 * notification's title and body; the app shows them as they are and opens what they are about.
 *
 * For field users today: a hotspot manager hears when the district sends stock
 * (`order.hotspot_delivery`), and a VHT hears the DCFP's decisions and comments on hotspots they
 * submitted (`hotspot.*`).
 */

/** `Notification`, the fields the app reads. */
export interface ApiNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  resource_type: string | null;
  resource_id: string | null;
  data: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
}

/** How many notifications the inbox keeps; the API's own maximum page. */
export const INBOX_LIMIT = 100;

/** GET /notifications: newest first. */
export async function listNotifications(limit = INBOX_LIMIT): Promise<ApiNotification[]> {
  const { data } = await api.get<{ data: ApiNotification[] }>("/notifications", {
    params: { limit, offset: 0 },
  });
  return data.data;
}

/** POST /notifications/{id}/read. */
export async function markNotificationRead(id: string): Promise<void> {
  await api.post(`/notifications/${id}/read`);
}

/** POST /notifications/read-all. */
export async function markAllNotificationsRead(): Promise<void> {
  await api.post("/notifications/read-all");
}

/** The prefix of an inbox entry's `ref` that says which screen opens it (see useOpenNote). */
export const STOCKOUT_REF = "STK-";
/** A delivery named for the signed-in delivery agent (`order.delivery_assigned`). */
export const DELIVERY_REF = "DLV-";
export const HOTSPOT_REF = "HS-";

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

/**
 * Where a notification leads: a stockout's page (delivery notifications name their report), else
 * the record it is about. An empty ref opens nothing.
 */
export function refOf(
  n: Pick<ApiNotification, "type" | "resource_type" | "resource_id" | "data">,
): string {
  const delivery = text(n.data?.delivery_id);
  if (n.type === "order.delivery_assigned" && delivery) return DELIVERY_REF + delivery;
  const report = text(n.data?.report_id);
  if (report) return STOCKOUT_REF + report;
  if (n.resource_type === "hotspot" && n.resource_id) return HOTSPOT_REF + n.resource_id;
  return "";
}

/** Who a notification is from, in words: the district for decisions about places and stock. */
function senderOf(n: Pick<ApiNotification, "type" | "data">): { role: EventRole; org: string } {
  const district = text(n.data?.district);
  if (n.type.startsWith("hotspot.") || n.type.startsWith("order."))
    return {
      role: "DCFP",
      org: district ? `${district} district` : "District focal person",
    };
  return { role: "System", org: "CLIMS" };
}

/** An API notification as an inbox entry for the signed-in role. */
export function toInboxEvent(n: ApiNotification, role: AppRole): AppEvent {
  const { role: from, org } = senderOf(n);
  return {
    id: `N-${n.id}`,
    serverId: n.id,
    t: Date.parse(n.created_at) || Date.now(),
    ref: refOf(n),
    role: from,
    actor: org,
    org,
    text: n.title.trim() || "Notification",
    body: n.body.trim() || undefined,
    readAt: n.read_at ? Date.parse(n.read_at) || Date.now() : null,
    to: [role],
  };
}

/** Whether an inbox entry is unread: API ones by their read time, local ones by `read`. */
export function isUnread(e: AppEvent, readUpTo: number): boolean {
  return e.serverId ? !e.readAt : e.t > readUpTo;
}
