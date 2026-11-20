import { z } from 'zod';

import { parseBody, parseList, type HttpClient } from '@/lib/api';

/*
 * District fulfilment: hotspot orders, warehouse requests, the district store,
 * riders and the activity feed.
 *
 * NOT YET IN THE GO API. These paths and shapes are the contract the web
 * client is written against and the mock API (`dev/mock/fulfilment.mts`)
 * serves; Phase 4 of `design/IMPLEMENTATION_PLAN.md` lists them for the
 * backend. Every screen that reads them shows a sample-data notice until the
 * real endpoints exist. The server scopes every list to the signed-in DCFP's
 * district.
 */

const count = z.number().int().nonnegative();
const quantitiesSchema = z.object({ male: count, female: count });
const signedQuantitiesSchema = z.object({ male: z.number().int(), female: z.number().int() });
const productSchema = z.enum(['male', 'female']);
const timestamp = z.string();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const batchLineSchema = z.object({
  product: productSchema,
  batch: z.string(),
  manufactured_on: day,
  expires_on: day,
  quantity: count,
});

const hotspotSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.string().nullable(),
  village: z.string().nullable(),
  subcounty: z.string().nullable(),
  district: z.string().nullable(),
  contact_name: z.string().nullable(),
  contact_phone: z.string().nullable(),
  /** The dispenser's condition, or null when the hotspot has none. */
  dispenser: z.string().nullable(),
  vhts: z.array(z.string()),
});

const riderSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  phone: z.string(),
  plate: z.string(),
});

export const ORDER_STATUSES = [
  'queued',
  'on_hold',
  'confirmed',
  'dispatched',
  'in_transit',
  'delivered',
  'received',
] as const;

export const orderSchema = z.object({
  id: z.string(),
  hotspot: hotspotSummarySchema,
  requested: quantitiesSchema,
  approved: quantitiesSchema,
  /** What the hotspot had left when it reported, if it said. */
  stock_at_hotspot: quantitiesSchema.nullable(),
  reason: z.string(),
  note: z.string().nullable(),
  status: z.enum(ORDER_STATUSES),
  requested_by: z.object({ name: z.string(), role: z.string() }),
  created_at: timestamp,
  confirmed_at: timestamp.nullable(),
  hold_reason: z.string().nullable(),
  warehouse_request_id: z.string().nullable(),
  /** Batches reserved for the order; they print on the delivery note. */
  allocation: z.array(batchLineSchema),
  delivery: z
    .object({
      note_number: z.string(),
      rider: riderSummarySchema,
      assigned_at: timestamp,
      collected_at: timestamp.nullable(),
      delivered_at: timestamp.nullable(),
    })
    .nullable(),
  received_at: timestamp.nullable(),
});

export type HotspotOrder = z.infer<typeof orderSchema>;
export type OrderStatus = HotspotOrder['status'];
export type BatchLine = z.infer<typeof batchLineSchema>;

export const REQUEST_STATUSES = [
  'sent',
  'under_review',
  'queued',
  'on_hold',
  'dispatched',
  'received',
] as const;

export const WAREHOUSES = ['NMS', 'JMS'] as const;
export type WarehouseCode = (typeof WAREHOUSES)[number];

export const RECEIPT_CONDITIONS = ['Intact', 'Damaged', 'Batch or expiry differs'] as const;
export type ReceiptCondition = (typeof RECEIPT_CONDITIONS)[number];

const receiptLineSchema = batchLineSchema.extend({
  on_waybill: count,
  counted: count,
  damaged: count,
  condition: z.string(),
  accepted: count,
});

export const requestSchema = z.object({
  id: z.string(),
  warehouse: z.enum(WAREHOUSES),
  district: z.string(),
  requested_by: z.string(),
  items: quantitiesSchema,
  linked_orders: z.array(z.string()),
  note: z.string().nullable(),
  status: z.enum(REQUEST_STATUSES),
  created_at: timestamp,
  hold_reason: z.string().nullable(),
  dispatch: z
    .object({
      dispatched_at: timestamp,
      waybill: z.string(),
      vehicle: z.string(),
      driver: z.string(),
      items: quantitiesSchema,
      lines: z.array(batchLineSchema),
    })
    .nullable(),
  receipt: z
    .object({
      received_at: timestamp,
      received_by: z.string(),
      grn: z.string(),
      accepted: quantitiesSchema,
      store_after: quantitiesSchema,
      lines: z.array(receiptLineSchema),
      discrepancy: z.object({ type: z.string(), note: z.string() }).nullable(),
    })
    .nullable(),
});

export type WarehouseRequest = z.infer<typeof requestSchema>;
export type RequestStatus = WarehouseRequest['status'];

export const storeSchema = z.object({
  name: z.string(),
  district: z.string(),
  stock: quantitiesSchema,
  min_levels: quantitiesSchema,
  batches: z.array(batchLineSchema),
  movements: z.array(
    z.object({
      at: timestamp,
      reference: z.string(),
      description: z.string(),
      change: signedQuantitiesSchema,
      balance: quantitiesSchema,
    }),
  ),
});

export type DistrictStore = z.infer<typeof storeSchema>;
export type StockMovement = DistrictStore['movements'][number];

const riderSchema = riderSummarySchema.extend({
  status: z.enum(['available', 'on_delivery', 'off_duty']),
});

export type Rider = z.infer<typeof riderSchema>;

export const activitySchema = z.object({
  id: z.string(),
  at: timestamp,
  actor: z.string(),
  role: z.enum(['hotspot_manager', 'vht', 'dcfp', 'warehouse', 'rider', 'moh', 'system']),
  /** The role as written, e.g. "NMS" for a warehouse user. */
  role_label: z.string(),
  text: z.string(),
  /** The order or request the event is about. */
  reference: z.string().nullable(),
});

export type Activity = z.infer<typeof activitySchema>;

/* Reads. */

export async function listOrders(http: HttpClient, signal?: AbortSignal): Promise<HotspotOrder[]> {
  return parseList(orderSchema, await http.get('/hotspot-orders', { signal }), 'hotspot orders');
}

export async function getOrder(
  http: HttpClient,
  id: string,
  signal?: AbortSignal,
): Promise<HotspotOrder> {
  const body = await http.get(`/hotspot-orders/${encodeURIComponent(id)}`, { signal });
  return parseBody(orderSchema, body, 'hotspot order');
}

export async function listRequests(
  http: HttpClient,
  signal?: AbortSignal,
): Promise<WarehouseRequest[]> {
  const body = await http.get('/warehouse-requests', { signal });
  return parseList(requestSchema, body, 'warehouse requests');
}

export async function getRequest(
  http: HttpClient,
  id: string,
  signal?: AbortSignal,
): Promise<WarehouseRequest> {
  const body = await http.get(`/warehouse-requests/${encodeURIComponent(id)}`, { signal });
  return parseBody(requestSchema, body, 'warehouse request');
}

export async function getDistrictStore(
  http: HttpClient,
  signal?: AbortSignal,
): Promise<DistrictStore> {
  return parseBody(storeSchema, await http.get('/district-store', { signal }), 'district store');
}

export async function listRiders(http: HttpClient, signal?: AbortSignal): Promise<Rider[]> {
  return parseList(riderSchema, await http.get('/riders', { signal }), 'riders');
}

export async function listActivity(http: HttpClient, signal?: AbortSignal): Promise<Activity[]> {
  return parseList(activitySchema, await http.get('/activity', { signal }), 'activity');
}

/* Writes. Each returns nothing: callers refetch, since one action moves stock, orders and requests. */

export interface Quantity {
  male: number;
  female: number;
}

/** Batches to issue. Leave out to let the server pick first-expiry-first-out. */
export interface PickInput {
  product: 'male' | 'female';
  batch: string;
  quantity: number;
}

export interface ConfirmOrderInput {
  approved: Quantity;
  lines?: PickInput[];
}

const orderPath = (id: string, action: string) =>
  `/hotspot-orders/${encodeURIComponent(id)}/${action}`;

export async function confirmOrder(
  http: HttpClient,
  id: string,
  input: ConfirmOrderInput,
): Promise<void> {
  await http.post(orderPath(id, 'confirm'), input);
}

export interface HoldOrderInput {
  reason: string;
  /** The quantities reviewed so far, kept for when the order is released. */
  approved?: Quantity;
}

export async function holdOrder(
  http: HttpClient,
  id: string,
  input: HoldOrderInput,
): Promise<void> {
  await http.post(orderPath(id, 'hold'), input);
}

export async function releaseOrder(
  http: HttpClient,
  id: string,
  input: { lines?: PickInput[] },
): Promise<void> {
  await http.post(orderPath(id, 'release'), input);
}

export async function dispatchOrder(http: HttpClient, id: string, riderId: string): Promise<void> {
  await http.post(orderPath(id, 'dispatch'), { rider_id: riderId });
}

export interface NewRequestInput {
  warehouse: WarehouseCode;
  items: Quantity;
  /** Held orders to release when this stock arrives. */
  linked_orders: string[];
  note: string;
}

/** Sends a request to a warehouse and returns its ID. */
export async function createRequest(http: HttpClient, input: NewRequestInput): Promise<string> {
  const body = await http.post('/warehouse-requests', input);
  return parseBody(requestSchema, body, 'warehouse request').id;
}

export interface ReceiptLineInput {
  product: 'male' | 'female';
  batch: string;
  counted: number;
  damaged: number;
  condition: ReceiptCondition;
}

export interface ReceiveInput {
  /** One per waybill line, in waybill order. */
  lines: ReceiptLineInput[];
  /** Required when anything differs from the waybill. */
  discrepancy: { type: string; note: string } | null;
}

export async function receiveRequest(
  http: HttpClient,
  id: string,
  input: ReceiveInput,
): Promise<void> {
  await http.post(`/warehouse-requests/${encodeURIComponent(id)}/receive`, input);
}
