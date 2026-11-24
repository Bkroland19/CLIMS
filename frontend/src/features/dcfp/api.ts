import { z } from 'zod';

import { orderSchema, orderAction, type Order } from '@/features/orders/api';
import { ApiError, parseBody, parseList, readAllPages, type HttpClient } from '@/lib/api';

/*
 * The DCFP's two flows against the Go API (docs/modules/orders.md):
 *
 * 1. Hotspots report stockouts. A report is a request to the district's DCFPs,
 *    with the hotspot's details and a message. The DCFP sends district stock
 *    against it, or rejects it with a reason before any stock goes.
 * 2. The DCFP orders a product and quantity from NMS or JMS. The warehouse
 *    approves it (review), checks stock and dispatches it, or rejects it with
 *    a reason; the DCFP records the receipt.
 *
 * Ids are UUIDs. The API scopes every list to the signed-in user's store.
 */

const text = z.string().nullable();

export const stockoutReportSchema = z.object({
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
  /** Further reports while this one was open: the hotspot says it again rather than raising another. */
  repeat_count: z.number().int().nonnegative().optional(),
  last_reported_at: z.string().optional(),
  created_at: z.string(),
  status: z
    .enum([
      'awaiting_supply',
      'awaiting_acknowledgement',
      'partly_received',
      'fulfilled',
      'rejected',
    ])
    .optional(),
  /** Set when the district rejected the request instead of sending stock; it is then closed. */
  rejected_at: z.string().nullish(),
  rejected_by: z.string().nullish(),
  /** Why the district rejected it; the hotspot reads this. */
  rejection_reason: z.string().nullish(),
  /** The hotspot's district, on lists. */
  district_id: z.string().nullish(),
});

export type StockoutReport = z.infer<typeof stockoutReportSchema>;

/** A delivery agent: an active user with `orders:deliver` working in the hotspot's district. */
const riderSchema = z.object({ id: z.string(), name: z.string(), phone: text });

export type Rider = z.infer<typeof riderSchema>;

const eventLine = z.object({ category: z.enum(['male', 'female']), pieces: z.number() });

/**
 * One step in a report's life, oldest first. `data` depends on the action: `raised` and the
 * repeats carry the hotspot's `comment`; `delivered` and `acknowledged` carry `lines` in pieces.
 */
const reportEventSchema = z.object({
  id: z.string(),
  action: z.string(),
  selection: z.string(),
  data: z
    .object({
      comment: z.string().nullable().optional(),
      reported: z.string().optional(),
      /** The district's reason, on a `rejected` event. */
      reason: z.string().optional(),
      lines: z.array(eventLine).optional(),
    })
    .nullable(),
  created_at: z.string(),
});

export type ReportEvent = z.infer<typeof reportEventSchema>;

const stockoutDetailSchema = stockoutReportSchema.extend({
  events: z.array(reportEventSchema).default([]),
  deliveries: z.array(
    z.object({
      id: z.string(),
      note: text,
      created_at: z.string(),
      /** The delivery agent carrying it, when one was named. */
      rider: riderSchema.nullish(),
      lines: z.array(
        z.object({
          id: z.string(),
          product: z.string(),
          category: z.enum(['male', 'female']),
          quantity: z.number(),
          pieces: z.number(),
          acknowledged_pieces: z.number().nullable(),
          acknowledged_at: text,
        }),
      ),
    }),
  ),
});

export type StockoutDetail = z.infer<typeof stockoutDetailSchema>;

export async function getStockout(
  http: HttpClient,
  id: string,
  signal?: AbortSignal,
): Promise<StockoutDetail> {
  return parseBody(
    stockoutDetailSchema,
    await http.get(`/orders/stockouts/${encodeURIComponent(id)}`, { signal }),
    'stockout dispatch history',
  );
}

/** The delivery agents who may carry a delivery for a report, by name. */
export async function listStockoutRiders(
  http: HttpClient,
  reportId: string,
  signal?: AbortSignal,
): Promise<Rider[]> {
  const body = await http.get(`/orders/stockouts/${encodeURIComponent(reportId)}/riders`, {
    signal,
  });
  return parseList(riderSchema, body, 'delivery agents');
}

export interface HotspotDeliveryInput {
  lines: { condom_id: string; unit_of_measure_id: string; quantity: number }[];
  client_reference: string;
  note?: string;
  /** Optional delivery agent carrying it; see {@link listStockoutRiders}. */
  rider_id?: string;
  expiry_exception_reason?: string;
}

export async function deliverStock(
  http: HttpClient,
  reportId: string,
  input: HotspotDeliveryInput,
): Promise<StockoutReport> {
  return parseBody(
    stockoutReportSchema,
    await http.post(`/orders/stockouts/${encodeURIComponent(reportId)}/deliveries`, input),
    'hotspot delivery',
  );
}

/** The API's limit on a rejection reason. */
export const REJECTION_REASON_MAX = 1000;

/**
 * Reject a request the district will not supply, before any stock has gone to it. The hotspot is
 * told the reason. Rejecting a rejected request again returns it unchanged.
 */
export async function rejectStockout(
  http: HttpClient,
  reportId: string,
  reason: string,
): Promise<StockoutDetail> {
  return parseBody(
    stockoutDetailSchema,
    await http.post(`/orders/stockouts/${encodeURIComponent(reportId)}/rejection`, { reason }),
    'stockout rejection',
  );
}

export {
  getOrder,
  listOrderEvents,
  listOrders,
  listWarehouses,
  ORDER_STATUSES,
  type Order,
  type OrderEvent,
  type OrderStatus,
  type Warehouse,
} from '@/features/orders/api';

/* Reads. */

export async function listStockouts(
  http: HttpClient,
  signal?: AbortSignal,
): Promise<StockoutReport[]> {
  const { items, complete } = await readAllPages(
    async (offset, limit) =>
      parseList(
        stockoutReportSchema,
        await http.get(`/orders/stockouts?limit=${limit}&offset=${offset}`, { signal }),
        'stockout reports',
      ),
    { pageSize: 100, maxPages: 100 },
  );
  if (!complete)
    throw new ApiError({
      kind: 'unexpected_response',
      message: 'Too many stockout reports to load. Contact an administrator.',
    });
  return items;
}

/* Writes. */

/**
 * The district names a condom category and a quantity, with no product or unit: the warehouse
 * chooses the product at review and the order is counted in that product's unit.
 */
export interface WarehouseOrderInput {
  warehouse_store_id: string;
  condom_category: 'male' | 'female';
  quantity: number;
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
  return orderAction(http, id, 'receive', input);
}
