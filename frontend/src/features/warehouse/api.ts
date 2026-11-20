import { z } from 'zod';

import {
  activitySchema,
  requestSchema,
  storeSchema,
  WAREHOUSES,
  type Activity,
  type PickInput,
  type WarehouseCode,
  type WarehouseRequest,
} from '@/features/fulfilment/api';
import { parseBody, parseList, type HttpClient } from '@/lib/api';

/*
 * The warehouse side of district restocking: the requests district stores
 * send to NMS or JMS, the warehouse's own stock, and what it does with each
 * request (accept, hold, dispatch).
 *
 * NOT YET IN THE GO API. These paths and shapes are the contract the web
 * client is written against and the mock API (`dev/mock/warehouse.mts`)
 * serves; Phase 5 of `design/IMPLEMENTATION_PLAN.md` lists them for the
 * backend. Every screen that reads them shows a sample-data notice until the
 * real endpoints exist.
 *
 * A request is the same record the district sees (`WarehouseRequest` from
 * the fulfilment feature): when the warehouse dispatches it, the district
 * receives it against the same waybill lines. Every path is scoped to one
 * warehouse, `/warehouses/{code}/…`; the server checks the user may act for it.
 */

export type { WarehouseCode, WarehouseRequest };

const warehouseStockSchema = z.object({
  code: z.enum(WAREHOUSES),
  name: z.string(),
  /** Where the warehouse is, e.g. "Entebbe". */
  location: z.string(),
  /** Every piece held, including batches that cannot be dispatched. */
  stock: storeSchema.shape.stock,
  min_levels: storeSchema.shape.min_levels,
  batches: storeSchema.shape.batches,
  /** Newest first. */
  movements: storeSchema.shape.movements,
});

export type WarehouseStock = z.infer<typeof warehouseStockSchema>;
export type WarehouseBatch = WarehouseStock['batches'][number];
export type WarehouseMovement = WarehouseStock['movements'][number];

const base = (store: WarehouseCode) => `/warehouses/${encodeURIComponent(store)}`;
const requestPath = (store: WarehouseCode, id: string) =>
  `${base(store)}/requests/${encodeURIComponent(id)}`;

/* Reads. */

/** Every district's requests to this warehouse, newest first. */
export async function listWarehouseRequests(
  http: HttpClient,
  store: WarehouseCode,
  signal?: AbortSignal,
): Promise<WarehouseRequest[]> {
  const body = await http.get(`${base(store)}/requests`, { signal });
  return parseList(requestSchema, body, 'district requests');
}

/** One request. A request sent to the other warehouse is not found here. */
export async function getWarehouseRequest(
  http: HttpClient,
  store: WarehouseCode,
  id: string,
  signal?: AbortSignal,
): Promise<WarehouseRequest> {
  const body = await http.get(requestPath(store, id), { signal });
  return parseBody(requestSchema, body, 'district request');
}

export async function getWarehouseStock(
  http: HttpClient,
  store: WarehouseCode,
  signal?: AbortSignal,
): Promise<WarehouseStock> {
  const body = await http.get(`${base(store)}/stock`, { signal });
  return parseBody(warehouseStockSchema, body, 'warehouse stock');
}

/** What happened to this warehouse's requests and stock, newest first. */
export async function listWarehouseActivity(
  http: HttpClient,
  store: WarehouseCode,
  signal?: AbortSignal,
): Promise<Activity[]> {
  const body = await http.get(`${base(store)}/activity`, { signal });
  return parseList(activitySchema, body, 'warehouse activity');
}

/* Writes. Each returns nothing: callers refetch, since one action moves requests and stock. */

/** Marks a new request as under review. Opening a request's page does this once. */
export async function openWarehouseRequest(
  http: HttpClient,
  store: WarehouseCode,
  id: string,
): Promise<void> {
  await http.post(`${requestPath(store, id)}/open`, {});
}

/** Accepts a request and queues it for picking. */
export async function acceptWarehouseRequest(
  http: HttpClient,
  store: WarehouseCode,
  id: string,
): Promise<void> {
  await http.post(`${requestPath(store, id)}/accept`, {});
}

export interface HoldRequestInput {
  /** Why, in words the district reads, e.g. "Awaiting supplier delivery". */
  reason: string;
}

/** Puts a request on hold. The district is notified with the reason. */
export async function holdWarehouseRequest(
  http: HttpClient,
  store: WarehouseCode,
  id: string,
  input: HoldRequestInput,
): Promise<void> {
  await http.post(`${requestPath(store, id)}/hold`, input);
}

/** Returns a held request to the queue, so its stock is checked again. */
export async function requeueWarehouseRequest(
  http: HttpClient,
  store: WarehouseCode,
  id: string,
): Promise<void> {
  await http.post(`${requestPath(store, id)}/requeue`, {});
}

export interface DispatchRequestInput {
  waybill: string;
  /** The vehicle's registration, e.g. "UAX 233K". */
  vehicle: string;
  driver: string;
  /** One line per batch picked; each prints on the waybill. May be less than was requested. */
  lines: PickInput[];
}

/** Takes the picked batches out of warehouse stock and sends them to the district store. */
export async function dispatchWarehouseRequest(
  http: HttpClient,
  store: WarehouseCode,
  id: string,
  input: DispatchRequestInput,
): Promise<void> {
  await http.post(`${requestPath(store, id)}/dispatch`, input);
}
