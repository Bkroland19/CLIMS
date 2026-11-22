import type { AppNotification } from '@/components/layout/NotificationsBell';
import type { StatusTone } from '@/lib/status';

import type { InboxNotification } from './api';

const TONES: Record<string, StatusTone> = {
  'order.stockout_reported': 'negative',
  'order.replenishment_requested': 'info',
  'order.replenishment_approved': 'positive',
  'order.replenishment_rejected': 'negative',
  'order.shipment_dispatched': 'caution',
  'order.shipment_received': 'positive',
  'hotspot.submitted': 'info',
  'hotspot.resubmitted': 'info',
};

/** Hotspot notifications sent to a district's DCFPs, as opposed to the VHT who submitted it. */
const FOR_DCFP_HOTSPOTS = new Set([
  'hotspot.submitted',
  'hotspot.updated',
  'hotspot.resubmitted',
  'hotspot.commented',
]);

/** Order notifications sent to the DCFPs of the district that placed the order. */
const DCFP_ORDER_TYPES = new Set([
  'order.replenishment_approved',
  'order.replenishment_rejected',
  'order.shipment_dispatched',
  'order.shipment_received',
]);

/**
 * The DCFP screen a notification opens, or null when it has no web screen yet (the warehouse's
 * screens, for example, are not on the API) or the user cannot open the DCFP workspace.
 */
export function hrefFor(notification: InboxNotification, canOpenDcfp: boolean): string | null {
  if (!canOpenDcfp) return null;
  const { type, resource_type: kind, resource_id: id } = notification;
  if (type === 'order.stockout_reported') return '/dcfp/stockouts';
  if (DCFP_ORDER_TYPES.has(type) && kind === 'order' && id) {
    return `/dcfp/restock/${encodeURIComponent(id)}`;
  }
  if (FOR_DCFP_HOTSPOTS.has(type)) return '/dcfp/hotspots';
  return null;
}

/** The bell's item for an inbox notification. */
export function toAppNotification(
  notification: InboxNotification,
  canOpenDcfp: boolean,
  formatTime: (iso: string) => string,
): AppNotification {
  return {
    id: notification.id,
    text: notification.body || notification.title,
    meta: `${notification.title} · ${formatTime(notification.created_at)}`,
    tone: TONES[notification.type] ?? 'neutral',
    unread: notification.read_at === null,
    href: hrefFor(notification, canOpenDcfp) ?? undefined,
  };
}

/** Unread notifications of one type, e.g. stockout reports for the sidebar badge. */
export function unreadOfType(notifications: readonly InboxNotification[], type: string): number {
  return notifications.filter((n) => n.type === type && n.read_at === null).length;
}
