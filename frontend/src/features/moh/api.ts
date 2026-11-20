import { z } from 'zod';

import {
  activitySchema,
  orderSchema,
  ORDER_STATUSES,
  requestSchema,
  WAREHOUSES,
  type Activity,
  type HotspotOrder,
  type WarehouseRequest,
} from '@/features/fulfilment/api';
import { parseBody, parseList, type HttpClient } from '@/lib/api';

/*
 * The national (MOH) view of fulfilment: hotspot orders and warehouse
 * requests across every district, each order's audit trail, district stores
 * and the national headline figures. Read-only.
 *
 * NOT YET IN THE GO API. These paths and shapes are the contract the web
 * client is written against and the mock API (`dev/mock/moh.mts`) serves;
 * Phase 6 of `design/IMPLEMENTATION_PLAN.md` lists them for the backend.
 * Records reuse the district shapes from `src/features/fulfilment/api.ts`.
 * Every screen that reads them shows a sample-data notice until the real
 * endpoints exist.
 */

const count = z.number().int().nonnegative();
const quantitiesSchema = z.object({ male: count, female: count });
const timestamp = z.string();

const orderDetailSchema = z.object({
  order: orderSchema,
  /** The warehouse request raised to restock for this order, if there was one. */
  warehouse_request: requestSchema.nullable(),
  /** When the order was first put on hold for stock, if it ever was. */
  held_at: timestamp.nullable(),
  /** Every action on the order and on its warehouse request. */
  trail: z.array(activitySchema),
});

export type OrderDetail = z.infer<typeof orderDetailSchema>;

const summarySchema = z.object({
  /** Stock at each national warehouse, in pieces. */
  warehouse_stock: z.array(z.object({ warehouse: z.enum(WAREHOUSES), stock: quantitiesSchema })),
  /** Hotspot orders by status, across every district, open and closed this month. */
  orders_by_status: z.record(z.enum(ORDER_STATUSES), count),
  /** Stockouts hotspots reported in the last seven days. */
  stockouts_last_7_days: count,
  /** Mean minutes from the stockout notification to confirmed receipt; null before any receipt. */
  average_lead_minutes: z.number().nonnegative().nullable(),
});

export type NationalSummary = z.infer<typeof summarySchema>;

const districtStoreSchema = z.object({
  district: z.string(),
  store: z.string(),
  stock: quantitiesSchema,
  min_levels: quantitiesSchema,
  /** Hotspot orders in the district not yet received. */
  open_orders: count,
});

export type DistrictStoreSummary = z.infer<typeof districtStoreSchema>;

/** Narrows a national list to one district. Leave `district` out for every district. */
export interface DistrictScope {
  district?: string | undefined;
}

function scoped(path: string, { district }: DistrictScope): string {
  return district ? `${path}?${new URLSearchParams({ district }).toString()}` : path;
}

export async function listNationalOrders(
  http: HttpClient,
  scope: DistrictScope,
  signal?: AbortSignal,
): Promise<HotspotOrder[]> {
  const body = await http.get(scoped('/national/hotspot-orders', scope), { signal });
  return parseList(orderSchema, body, 'hotspot orders');
}

export async function getNationalOrder(
  http: HttpClient,
  id: string,
  signal?: AbortSignal,
): Promise<OrderDetail> {
  const body = await http.get(`/national/hotspot-orders/${encodeURIComponent(id)}`, { signal });
  return parseBody(orderDetailSchema, body, 'hotspot order');
}

export async function listNationalRequests(
  http: HttpClient,
  scope: DistrictScope,
  signal?: AbortSignal,
): Promise<WarehouseRequest[]> {
  const body = await http.get(scoped('/national/warehouse-requests', scope), { signal });
  return parseList(requestSchema, body, 'warehouse requests');
}

export async function getNationalSummary(
  http: HttpClient,
  signal?: AbortSignal,
): Promise<NationalSummary> {
  return parseBody(summarySchema, await http.get('/national/summary', { signal }), 'summary');
}

export async function listDistrictStores(
  http: HttpClient,
  signal?: AbortSignal,
): Promise<DistrictStoreSummary[]> {
  const body = await http.get('/national/district-stores', { signal });
  return parseList(districtStoreSchema, body, 'district stores');
}

/** The latest actions by people in every role, newest first. System events are left out. */
export async function listNationalActivity(
  http: HttpClient,
  signal?: AbortSignal,
): Promise<Activity[]> {
  const body = await http.get('/national/activity', { signal });
  return parseList(activitySchema, body, 'activity');
}
