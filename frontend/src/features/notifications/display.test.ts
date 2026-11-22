import { describe, expect, it } from 'vitest';

import { notificationHref, notificationTone, type InboxWorkspace } from './display';

const only =
  (...workspaces: InboxWorkspace[]) =>
  (workspace: InboxWorkspace) =>
    workspaces.includes(workspace);

const about = (type: string, id: string | null = 'r1') => ({ type, resource_id: id });

describe('notificationHref', () => {
  it('opens a DCFP’s stockouts as alerts and shipments as warehouse requests', () => {
    const dcfp = only('dcfp');
    expect(notificationHref(about('order.stockout_reported'), dcfp)).toBe('/dcfp/orders/r1');
    expect(notificationHref(about('order.delivered'), dcfp)).toBe('/dcfp/orders/r1');
    expect(notificationHref(about('order.shipment_dispatched'), dcfp)).toBe('/dcfp/restock/r1');
    expect(notificationHref(about('order.shipment_received'), dcfp)).toBe('/dcfp/restock/r1');
  });

  it('opens a hotspot in the review queue for a DCFP and in the VHT’s list otherwise', () => {
    expect(notificationHref(about('hotspot.submitted'), only('dcfp'))).toBe('/dcfp/hotspots/r1');
    expect(notificationHref(about('hotspot.rejected'), only('vht'))).toBe('/vht');
  });

  it('sends the warehouse to its request list', () => {
    expect(notificationHref(about('order.replenishment_requested'), only('warehouse'))).toBe(
      '/warehouse/requests',
    );
  });

  it('links nothing the reader cannot open, nothing without a record and unknown types', () => {
    expect(notificationHref(about('order.stockout_reported'), only('vht'))).toBeNull();
    expect(notificationHref(about('order.delivery_assigned'), only())).toBeNull();
    expect(notificationHref(about('hotspot.commented', null), only('dcfp'))).toBeNull();
    expect(notificationHref(about('report.due'), only('dcfp', 'warehouse', 'vht'))).toBeNull();
  });
});

describe('notificationTone', () => {
  it('marks bad news, good news and unknown types', () => {
    expect(notificationTone('order.stockout_reported')).toBe('negative');
    expect(notificationTone('order.shipment_received')).toBe('positive');
    expect(notificationTone('report.due')).toBe('neutral');
  });
});
