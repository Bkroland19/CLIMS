import { z } from 'zod';

import { parseBody, parseList, type HttpClient } from '@/lib/api';

/*
 * The DCFP's two flows against the Go API (docs/modules/orders.md):
 *
 * 1. Hotspots report stockouts. A report is a notification to the district's
 *    DCFPs, with the hotspot's details and a message; it is not an order. The
 *    DCFP fulfils it by delivering from the district store, and the hotspot's
 *    manager acknowledges what arrived (field app).
 * 2. The DCFP orders a product and quantity from NMS or JMS. The warehouse
 *    reviews, checks stock and dispatches it; the DCFP records the receipt.
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
  /** Messages counted against this open report after the first. */
  repeat_count: count,
  last_reported_at: z.string(),
  status: z.enum(['awaiting_supply', 'awaiting_acknowledgement', 'partly_received', 'fulfilled']),
  /** When the last acknowledgement needed for every selected type was recorded. */
  fulfilled_at: text,
});

export type StockoutReport = z.infer<typeof stockoutReportSchema>;
export type StockoutStatus = StockoutReport['status'];

const deliveryLineSchema = z.object({
  id: z.string(),
  category: z.enum(['male', 'female']),
  condom_id: z.string(),
  product: z.string(),
  unit_of_measure_id: z.string(),
  /** In the product's catalogue unit. */
  quantity: count,
  /** `quantity` in single condoms: what the hotspot counts. */
  pieces: count,
  /** Null until the hotspot's manager confirms what arrived. */
  acknowledged_pieces: count.nullable(),
  acknowledged_at: text,
});

const stockoutDetailSchema = stockoutReportSchema.extend({
  deliveries: z.array(
    z.object({
      id: z.string(),
      delivered_by_id: z.string(),
      note: text,
      created_at: z.string(),
      lines: z.array(deliveryLineSchema),
    }),
  ),
  events: z.array(
    z.object({
      id: z.string(),
      actor_id: text,
      action: z.enum(['raised', 'repeated', 'selection_changed', 'delivered', 'acknowledged']),
      selection: z.enum(['male', 'female', 'both']),
      created_at: z.string(),
    }),
  ),
});

export type StockoutDetail = z.infer<typeof stockoutDetailSchema>;
export type HotspotDelivery = StockoutDetail['deliveries'][number];
export type DeliveryLine = z.infer<typeof deliveryLineSchema>;
export type StockoutEvent = StockoutDetail['events'][number];

/** One product's balance in a store, in the unit it is kept in. */
const stockBalanceSchema = z.object({
  condom_id: z.string(),
  product: z.string(),
  unit_of_measure_id: z.string(),
  unit: z.string(),
  on_hand: count,
  reserved: count,
  /** On hand less what is reserved for orders: what can leave now. */
  available: count,
});

export type StockBalance = z.infer<typeof stockBalanceSchema>;

export const ORDER_STATUSES = [
  'pending',
  'fulfilled',
  'queued',
  'reviewed',
  'on_hold',
  'confirmed',
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

export async function getStockout(
  http: HttpClient,
  id: string,
  signal?: AbortSignal,
): Promise<StockoutDetail> {
  const body = await http.get(`/orders/stockouts/${encodeURIComponent(id)}`, { signal });
  return parseBody(stockoutDetailSchema, body, 'stockout');
}

/** A store's balances, one row per product and unit. */
export async function listStoreStock(
  http: HttpClient,
  storeId: string,
  signal?: AbortSignal,
): Promise<StockBalance[]> {
  const body = await http.get(`/inventory/stock?store_id=${encodeURIComponent(storeId)}`, {
    signal,
  });
  return parseList(stockBalanceSchema, body, 'store stock');
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

/**
 * A delivery from the district store against a stockout report. Each line is a product of a
 * category the report asked for, in the product's catalogue unit.
 */
export interface DeliveryInput {
  lines: { condom_id: string; quantity: number }[];
  note: string | null;
  /** Chosen once per delivery, so a retried send is recorded once. */
  client_reference: string;
  /** Required when stock expiring within a month would leave the store. */
  expiry_exception_reason?: string;
}

export async function recordDelivery(
  http: HttpClient,
  id: string,
  input: DeliveryInput,
): Promise<StockoutDetail> {
  const body = await http.post(`/orders/stockouts/${encodeURIComponent(id)}/deliveries`, input);
  return parseBody(stockoutDetailSchema, body, 'stockout');
}
