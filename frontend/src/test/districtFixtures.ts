import type { Order, StockBalance } from '@/features/district/api';

/*
 * Orders and balances on the Go API's shapes, for the district data layer's
 * tests. Ids are short labels rather than UUIDs; nothing here checks them.
 */

export const DISTRICT_STORE = 'store-wakiso';
export const WAREHOUSE = 'store-nms';
export const MALE = 'product-male';
export const FEMALE = 'product-female';
export const BOX = 'unit-box';

/** A stockout alert, as raised: no unit or quantity yet. */
export function alert(id: string, fields: Partial<Order> = {}): Order {
  return {
    id,
    condom_id: MALE,
    quantity_needed: null,
    order_date: '2026-11-20',
    ordered_for_store_id: DISTRICT_STORE,
    ordered_from_store_id: DISTRICT_STORE,
    unit_of_measure_id: null,
    comment: null,
    ordered_by_id: 'user-vht',
    handled_by_id: null,
    quantity_issued: null,
    order_status: 'queued',
    created_at: '2026-11-20T08:00:00Z',
    updated_at: '2026-11-20T08:00:00Z',
    hot_spot_id: 'hotspot-kasenyi',
    parent_order_id: null,
    rider_id: null,
    quantity_received: null,
    discrepancy_note: null,
    delivery_note: null,
    ...fields,
  };
}

/** A warehouse request made for alert `parent`. */
export function request(id: string, parent: string, fields: Partial<Order> = {}): Order {
  return alert(id, {
    hot_spot_id: null,
    parent_order_id: parent,
    ordered_from_store_id: WAREHOUSE,
    unit_of_measure_id: BOX,
    quantity_needed: 20,
    ordered_by_id: 'user-dcfp',
    ...fields,
  });
}

export function balance(fields: Partial<StockBalance> = {}): StockBalance {
  return {
    store_id: DISTRICT_STORE,
    store_name: 'Wakiso',
    store_type: 'district',
    district_id: 'district-wakiso',
    district_name: 'Wakiso',
    condom_id: MALE,
    product: 'Engabu · Male · Free (public sector)',
    unit_of_measure_id: BOX,
    unit: 'Box',
    on_hand: 10,
    reserved: 0,
    available: 10,
    incoming: 0,
    updated_at: '2026-11-20T08:00:00Z',
    ...fields,
  };
}
