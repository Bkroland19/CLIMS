import { z } from 'zod';

import { orderSchema, orderAction, type Order } from '@/features/orders/api';
import { ApiError, parseBody, parseList, readAllPages, type HttpClient } from '@/lib/api';

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
  status: z
    .enum(['awaiting_supply', 'awaiting_acknowledgement', 'partly_received', 'fulfilled'])
    .optional(),
});

export type StockoutReport = z.infer<typeof stockoutReportSchema>;

const stockoutDetailSchema = stockoutReportSchema.extend({
  deliveries: z.array(
    z.object({
      id: z.string(),
      note: text,
      created_at: z.string(),
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

export interface HotspotDeliveryInput {
  lines: { condom_id: string; unit_of_measure_id: string; quantity: number }[];
  client_reference: string;
  note?: string;
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
