import { z } from 'zod';

import { parseBody, parseList, type HttpClient } from '@/lib/api';

/*
 * The DCFP's two flows against the Go API (docs/modules/orders.md):
 *
 * 1. Hotspots report stockouts. A report is a notification to the district's
 *    DCFPs, with the hotspot's details and a message; it is not an order.
 * 2. The DCFP orders a product and quantity from NMS or JMS. The warehouse
 *    approves it (review), checks stock and dispatches it, or rejects it with
 *    a reason; the DCFP records the receipt.
 *
 * Ids are UUIDs. The API scopes every list to the signed-in user's store.
 */

const text = z.string().nullable();
const count = z.number().int();

const stockoutReportSchema = z.object({
  id: z.string(),
  hot_spot_id: z.string(),
  hot_spot: z.object({
    name: z.string(),
    village: text,
    subcounty: text,
    district: text,
    contact_name: text,
    contact_phone: text,
  }),
  /** Null: a notification names a condom category (`selection`), not a product. */
  condom_id: z.string().nullable(),
  selection: z.enum(['male', 'female', 'both']),
  /** The product as the API names it, e.g. "Engabu Free Female", or the selection, e.g. "male condoms". */
  product: z.string(),
  district_store_id: z.string(),
  reported_by_id: z.string(),
  reported_by: z.string(),
  /** The hotspot's message for the DCFP. */
  comment: text,
  created_at: z.string(),
});

export type StockoutReport = z.infer<typeof stockoutReportSchema>;

export const ORDER_STATUSES = [
  'pending',
  'fulfilled',
  'queued',
  'reviewed',
  'on_hold',
  'confirmed',
  'rejected',
  'dispatched',
  'received',
  'delivered',
] as const;

const orderSchema = z.object({
  id: z.string(),
  /** Null until the warehouse chooses the product at review. */
  condom_id: z.string().nullable(),
  /** The condom category the district requested. */
  condom_category: z.enum(['male', 'female']).nullable(),
  quantity_needed: count.nullable(),
  /** What the warehouse approved at review; at most the quantity ordered. */
  quantity_approved: count.nullable().default(null),
  quantity_issued: count.nullable(),
  quantity_received: count.nullable(),
  order_status: z.enum(ORDER_STATUSES),
  order_date: z.string(),
  ordered_by_id: z.string(),
  ordered_for_store_id: z.string(),
  ordered_from_store_id: z.string(),
  unit_of_measure_id: text,
  comment: text,
  discrepancy_note: text,
  /** Why the warehouse rejected the order; set only on rejected orders. */
  rejection_reason: text.default(null),
  /** The transport the warehouse recorded at dispatch, each optional. */
  waybill_number: text.default(null),
  vehicle_registration: text.default(null),
  driver_name: text.default(null),
  driver_phone: text.default(null),
  /** Set only on alert orders raised before stockouts became reports. */
  hot_spot_id: text,
  created_at: z.string(),
  updated_at: z.string(),
});

export type Order = z.infer<typeof orderSchema>;
export type OrderStatus = Order['order_status'];

const eventSchema = z.object({
  id: z.string(),
  order_id: z.string(),
  actor_id: z.string(),
  action: z.string(),
  status: z.enum(ORDER_STATUSES),
  created_at: z.string(),
});

export type OrderEvent = z.infer<typeof eventSchema>;

const storeSchema = z.object({
  id: z.string(),
  /** `nms` or `jms` for a national warehouse. */
  code: z.string(),
  name: z.string(),
  store_type: z.enum(['national', 'district']),
});

export type Warehouse = z.infer<typeof storeSchema>;

/* Reads. */

// shortcut: the 100 newest of each list; page with `offset` when a district has more.
export async function listStockouts(
  http: HttpClient,
  signal?: AbortSignal,
): Promise<StockoutReport[]> {
  const body = await http.get('/orders/stockouts?limit=100', { signal });
  return parseList(stockoutReportSchema, body, 'stockout reports');
}

export async function listOrders(http: HttpClient, signal?: AbortSignal): Promise<Order[]> {
  return parseList(orderSchema, await http.get('/orders?limit=100', { signal }), 'orders');
}

export async function getOrder(http: HttpClient, id: string, signal?: AbortSignal): Promise<Order> {
  const body = await http.get(`/orders/${encodeURIComponent(id)}`, { signal });
  return parseBody(orderSchema, body, 'order');
}

export async function listOrderEvents(
  http: HttpClient,
  id: string,
  signal?: AbortSignal,
): Promise<OrderEvent[]> {
  const body = await http.get(`/orders/${encodeURIComponent(id)}/events`, { signal });
  return parseList(eventSchema, body, 'order history');
}

/** NMS and JMS. */
export async function listWarehouses(http: HttpClient, signal?: AbortSignal): Promise<Warehouse[]> {
  const body = await http.get('/locations/stores?store_type=national', { signal });
  return parseList(storeSchema, body, 'warehouses');
}

/* Writes. */

/** The district names a condom category; the warehouse chooses the product. */
export interface WarehouseOrderInput {
  warehouse_store_id: string;
  condom_category: 'male' | 'female';
  quantity: number;
  unit_of_measure_id: string;
  comment: string | null;
}

export async function createWarehouseOrder(
  http: HttpClient,
  input: WarehouseOrderInput,
): Promise<Order> {
  return parseBody(orderSchema, await http.post('/orders/warehouse-requests', input), 'order');
}

export interface ReceiptInput {
  quantity_received: number;
  /** Required when the count differs from what was dispatched. */
  discrepancy_note?: string;
}

export async function receiveOrder(
  http: HttpClient,
  id: string,
  input: ReceiptInput,
): Promise<Order> {
  const body = await http.post(`/orders/${encodeURIComponent(id)}/actions/receive`, input);
  return parseBody(orderSchema, body, 'order');
}
