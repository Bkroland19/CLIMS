import type { ActivityRole } from '@/components/ActivityTimeline';
import type { ChartRow } from '@/components/charts/ChartCard';
import type { Hotspot } from '@/features/hotspots/api';
import type { Notification } from '@/features/notifications/api';
import { notificationHref, type InboxWorkspace } from '@/features/notifications/display';

import type { HotspotStock, Order } from './api';
import { alertsIn } from './orders';

/*
 * The district dashboard's figures, all read from the API: alerts by week,
 * stockouts by sub-county, and the inbox as recent activity.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const weekFormat = new Intl.DateTimeFormat('en-UG', { day: 'numeric', month: 'short' });

/** Midnight at the start of the Monday of `date`'s week, in the display time zone. */
function startOfWeek(date: Date): Date {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const sinceMonday = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - sinceMonday);
  return start;
}

/**
 * Alerts reported and alerts delivered in each of the last `weeks` weeks,
 * oldest first, each labelled by the Monday it starts on. A delivery counts
 * in the week the alert last changed, which for a delivered alert is when it
 * was delivered.
 */
export function weeklyAlerts(orders: readonly Order[], now: Date, weeks = 8): ChartRow[] {
  const thisWeek = startOfWeek(now);
  const starts = Array.from({ length: weeks }, (_, index) => {
    const start = new Date(thisWeek);
    start.setDate(start.getDate() - 7 * (weeks - 1 - index));
    return start.getTime();
  });
  const weekOf = (iso: string) => {
    const time = startOfWeek(new Date(iso)).getTime();
    return starts.indexOf(time);
  };
  const reported = starts.map(() => 0);
  const delivered = starts.map(() => 0);
  for (const alert of alertsIn(orders)) {
    const raised = weekOf(alert.created_at);
    if (raised >= 0) reported[raised] = (reported[raised] ?? 0) + 1;
    if (alert.order_status === 'delivered') {
      const done = weekOf(alert.updated_at);
      if (done >= 0) delivered[done] = (delivered[done] ?? 0) + 1;
    }
  }
  return starts.map((start, index) => ({
    label: weekFormat.format(new Date(start)),
    values: { reported: reported[index] ?? 0, delivered: delivered[index] ?? 0 },
  }));
}

export interface SubcountyCount {
  label: string;
  value: number;
}

/**
 * Stockouts reported in the last `days` days, by the sub-county of the
 * hotspot that reported them, most first. Hotspots without a sub-county, or
 * no longer listed, are counted as "Sub-county not recorded".
 */
export function stockoutsBySubcounty(
  orders: readonly Order[],
  hotspots: readonly Pick<Hotspot, 'id' | 'subcounty'>[],
  now: Date,
  days = 30,
): SubcountyCount[] {
  const since = now.getTime() - days * DAY_MS;
  const subcountyOf = new Map(hotspots.map((hotspot) => [hotspot.id, hotspot.subcounty?.name]));
  const counts = new Map<string, number>();
  for (const alert of alertsIn(orders)) {
    if (new Date(alert.created_at).getTime() < since) continue;
    const label =
      (alert.hot_spot_id ? subcountyOf.get(alert.hot_spot_id) : null) ?? 'Sub-county not recorded';
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

/** How many of the district's hotspots have been sent stock, and how many have alerts open. */
export function hotspotCoverage(rows: readonly HotspotStock[]): {
  supplied: number;
  waiting: number;
} {
  const supplied = new Set<string>();
  const waiting = new Set<string>();
  for (const row of rows) {
    if (row.deliveries > 0) supplied.add(row.hot_spot_id);
    if (row.open_alerts > 0) waiting.add(row.hot_spot_id);
  }
  return { supplied: supplied.size, waiting: waiting.size };
}

export interface ActivityItem {
  id: string;
  title: string;
  /** Where the notification's record is shown, when the DCFP has a page for it. */
  href: string | null;
  role: ActivityRole;
  at: string;
}

/** On the DCFP's dashboard every record opens in the DCFP workspace. */
const inDcfp = (workspace: InboxWorkspace) => workspace === 'dcfp';

/** Whose step each kind of notification reports. */
function roleOf(type: string): ActivityRole {
  if (type === 'order.stockout_reported') return 'hotspot-manager';
  if (type === 'order.shipment_dispatched') return 'warehouse';
  if (type === 'order.shipment_received') return 'dcfp';
  return type.startsWith('hotspot.') ? 'vht' : 'system';
}

/** A notification in the inbox as a line of district activity. */
export function activityOf(notification: Notification): ActivityItem {
  return {
    id: notification.id,
    title: notification.title,
    at: notification.created_at,
    href: notificationHref(notification, inDcfp),
    role: roleOf(notification.type),
  };
}

/** Who each kind of activity comes from, in words, for the line under it. */
export const ACTIVITY_SOURCE: Record<ActivityRole, string> = {
  'hotspot-manager': 'Hotspot',
  vht: 'VHT',
  dcfp: 'District store',
  warehouse: 'Warehouse',
  rider: 'Rider',
  moh: 'MOH',
  system: 'CLIMS',
};
