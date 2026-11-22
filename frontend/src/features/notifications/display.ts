import { DCFP_PATHS } from '@/features/district/tasks';
import { WAREHOUSE_PATHS } from '@/features/warehouse/paths';
import type { StatusTone } from '@/lib/status';

import type { Notification } from './api';

/** The web workspaces a notification can open a page in. */
export type InboxWorkspace = 'dcfp' | 'warehouse' | 'vht';

/**
 * Where opening a notification goes, for someone who can open the workspaces
 * `canOpen` allows, or null when there is no page for it on the web.
 *
 * Who receives what (`backend/internal/features/orders|hotspots/notifications.go`):
 * the district store's DCFPs get stockouts, shipments on their way and
 * shipments received, and the hotspots submitted, updated, resubmitted or
 * commented on in their district; the warehouse gets requests for stock; the
 * rider gets the delivery they were given; whoever reported a stockout hears
 * it was delivered; a hotspot's submitter hears of comments and decisions.
 */
export function notificationHref(
  notification: Pick<Notification, 'type' | 'resource_id'>,
  canOpen: (workspace: InboxWorkspace) => boolean,
): string | null {
  const id = notification.resource_id;
  switch (notification.type) {
    case 'order.stockout_reported':
    case 'order.delivery_assigned':
    case 'order.delivered':
      return id && canOpen('dcfp') ? DCFP_PATHS.alert(id) : null;
    case 'order.shipment_dispatched':
    case 'order.shipment_received':
      return id && canOpen('dcfp') ? DCFP_PATHS.request(id) : null;
    case 'order.replenishment_requested':
      // The warehouse screens still read the prototype's orders, so the list
      // is the nearest page; its request pages do not know the real ids yet.
      return canOpen('warehouse') ? WAREHOUSE_PATHS.requests : null;
    default:
      if (!notification.type.startsWith('hotspot.') || !id) return null;
      if (canOpen('dcfp')) return DCFP_PATHS.hotspot(id);
      // A VHT's hotspots are one list, with no page per hotspot.
      return canOpen('vht') ? '/vht' : null;
  }
}

const TONES: Readonly<Record<string, StatusTone>> = {
  'order.stockout_reported': 'negative',
  'order.replenishment_requested': 'caution',
  'order.shipment_dispatched': 'info',
  'order.shipment_received': 'positive',
  'order.delivery_assigned': 'info',
  'order.delivered': 'positive',
  'hotspot.submitted': 'caution',
  'hotspot.updated': 'caution',
  'hotspot.resubmitted': 'caution',
  'hotspot.commented': 'info',
  'hotspot.activated': 'positive',
  'hotspot.deactivated': 'neutral',
  'hotspot.rejected': 'negative',
};

/** The colour of a notification's marker: bad news, something to act on, good news or neither. */
export function notificationTone(type: string): StatusTone {
  return TONES[type] ?? 'neutral';
}
