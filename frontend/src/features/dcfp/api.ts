import { z } from 'zod';

import { orderSchema, orderAction, type Order } from '@/features/orders/api';
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

// shortcut: the 100 newest of each list; page with `offset` when a district has more.
export async function listStockouts(
  http: HttpClient,
  signal?: AbortSignal,
): Promise<StockoutReport[]> {
  const body = await http.get('/orders/stockouts?limit=100', { signal });
  return parseList(stockoutReportSchema, body, 'stockout reports');
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
