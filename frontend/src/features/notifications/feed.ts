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

/** Which workspaces the signed-in person can open, so a notification links to one of them. */
export interface Opens {
  dcfp: boolean;
  warehouse: boolean;
}

/** Order notifications sent to the warehouse that supplies the order. */
const WAREHOUSE_ORDER_TYPES = new Set(['order.replenishment_requested', 'order.shipment_received']);

/**
 * The screen a notification opens, or null when it has none the person can open. Someone who
 * works in both a district and a warehouse workspace (an administrator) opens an order's DCFP
 * screen when the notification goes to both sides.
 */
export function hrefFor(notification: InboxNotification, opens: Opens): string | null {
  const { type, resource_type: kind, resource_id: id } = notification;
  if (opens.dcfp) {
    if (type === 'order.stockout_reported') return '/dcfp/stockouts';
    if (DCFP_ORDER_TYPES.has(type) && kind === 'order' && id) {
      return `/dcfp/restock/${encodeURIComponent(id)}`;
    }
    if (FOR_DCFP_HOTSPOTS.has(type)) return '/dcfp/hotspots';
  }
  if (opens.warehouse && WAREHOUSE_ORDER_TYPES.has(type) && kind === 'order' && id) {
    return `/warehouse/requests/${encodeURIComponent(id)}`;
  }
  return null;
}

/** The bell's item for an inbox notification. */
export function toAppNotification(
  notification: InboxNotification,
  opens: Opens,
  formatTime: (iso: string) => string,
): AppNotification {
  return {
    id: notification.id,
    text: notification.body || notification.title,
    meta: `${notification.title} · ${formatTime(notification.created_at)}`,
    tone: TONES[notification.type] ?? 'neutral',
    unread: notification.read_at === null,
    href: hrefFor(notification, opens) ?? undefined,
  };
}

/** Unread notifications of one type, e.g. stockout reports for the sidebar badge. */
export function unreadOfType(notifications: readonly InboxNotification[], type: string): number {
  return notifications.filter((n) => n.type === type && n.read_at === null).length;
}
