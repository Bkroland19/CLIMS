import type { HotspotStock } from '@/features/district/api';

/** What one hotspot has been sent and has waiting, summed over its products and units. */
export interface HotspotSupplySummary {
  deliveries: number;
  /** The most recent delivery of any product, or null when nothing has been delivered. */
  lastDelivered: string | null;
  /** Stockout alerts not yet sent or still waiting for the warehouse. */
  openAlerts: number;
}

/** The district's supply rows (`GET /inventory/hotspots`) summed per hotspot. */
export function supplyByHotspot(rows: readonly HotspotStock[]): Map<string, HotspotSupplySummary> {
  const byHotspot = new Map<string, HotspotSupplySummary>();
  for (const row of rows) {
    const summary = byHotspot.get(row.hot_spot_id) ?? {
      deliveries: 0,
      lastDelivered: null,
      openAlerts: 0,
    };
    summary.deliveries += row.deliveries;
    summary.openAlerts += row.open_alerts;
    if (
      row.last_delivered_at !== null &&
      (summary.lastDelivered === null || row.last_delivered_at > summary.lastDelivered)
    ) {
      summary.lastDelivered = row.last_delivered_at;
    }
    byHotspot.set(row.hot_spot_id, summary);
  }
  return byHotspot;
}
