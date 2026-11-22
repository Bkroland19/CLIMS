import { z } from 'zod';

import {
  ApiError,
  parseBody,
  parseList,
  readAllPages,
  toApiError,
  type AllPages,
  type HttpClient,
} from '@/lib/api';

/*
 * The district store's side of the order workflow on the Go API
 * (`backend/internal/features/orders` and `inventory`): stockout alerts from
 * hotspots, the warehouse requests that restock the store, the store's stock
 * and ledger, the riders who deliver, and what each hotspot has been sent.
 *
 *   GET  /orders?status=&limit=&offset=                Order[], newest first
 *   GET  /orders/:id                                   Order
 *   GET  /orders/:id/events?offset=                    OrderEvent[], 50 a page, newest first
 *   POST /orders/:id/actions/dispatch                  { rider_id, unit_of_measure_id, quantity_issued } → Order
 *   POST /orders/:id/actions/request-replenishment     { warehouse_store_id, unit_of_measure_id, quantity } → 201 Order (the request)
 *   POST /orders/:id/actions/receive                   { quantity_received, discrepancy_note? } → Order
 *   GET  /orders/riders                                Rider[]
 *   GET  /inventory/stock                              StockBalance[]
 *   GET  /inventory/movements?reason=&from=&to=&limit=&offset=   StockMovement[], newest first
 *   POST /inventory/movements                          { store_id, condom_id, unit_of_measure_id, reason, quantity, note } → 201 StockMovement
 *   GET  /inventory/hotspots                           HotspotStock[]
 *
 * The server scopes every read to the caller's store or district, so the
 * client sends no district. Stores come from `features/geography`, products
 * and units from `features/catalogue`, hotspots from `features/hotspots`.
 */

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
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const MOVEMENT_REASONS = [
  'opening',
  'receipt',
  'adjustment',
  'dispatch',
  'order_receipt',
] as const;
export type MovementReason = (typeof MOVEMENT_REASONS)[number];

/** The reasons a person can record; the others are written by the system. */
export const RECORDABLE_REASONS = ['receipt', 'adjustment'] as const;
export type RecordableReason = (typeof RECORDABLE_REASONS)[number];

const id = z.string().min(1);
const nullableId = id.nullable();
const count = z.number().int();

const orderSchema = z.object({
  id,
  condom_id: id,
  /** Null on an open stockout alert until the DCFP sends stock; then the quantity sent. */
  quantity_needed: count.nullable(),
  order_date: z.string(),
  ordered_for_store_id: id,
  ordered_from_store_id: id,
  /** Null on an open stockout alert until the DCFP sends stock. */
  unit_of_measure_id: nullableId,
  comment: z.string().nullable(),
  ordered_by_id: id,
  handled_by_id: nullableId,
  quantity_issued: count.nullable(),
  order_status: z.enum(ORDER_STATUSES),
  created_at: z.string(),
  updated_at: z.string(),
  /** Set on a stockout alert: the hotspot that ran out. */
  hot_spot_id: nullableId,
  /** Set on a warehouse request: the alert it restocks for. */
  parent_order_id: nullableId,
  rider_id: nullableId,
  quantity_received: count.nullable(),
  discrepancy_note: z.string().nullable(),
  delivery_note: z.string().nullable(),
});

export type Order = z.infer<typeof orderSchema>;

const orderEventSchema = z.object({
  id,
  order_id: id,
  /** Only the id: a DCFP cannot read other users' names. */
  actor_id: id,
  /** `stockout_reported`, `dispatch`, `request-replenishment`, `replenishment_requested`, `receive`, `deliver`, … */
  action: z.string(),
  /** The order's status after the step. */
  status: z.enum(ORDER_STATUSES),
  created_at: z.string(),
});

export type OrderEvent = z.infer<typeof orderEventSchema>;

const riderSchema = z.object({
  id,
  first_name: z.string(),
  last_name: z.string(),
  /** As recorded on the account; may be empty. */
  phone_number: z.string(),
  /** Hotspot orders dispatched to the rider and not yet delivered. */
  open_deliveries: count.nonnegative(),
});

export type Rider = z.infer<typeof riderSchema>;

const stockBalanceSchema = z.object({
  store_id: id,
  store_name: z.string(),
  store_type: z.enum(['national', 'district']),
  district_id: nullableId,
  district_name: z.string().nullable(),
  condom_id: id,
  product: z.string(),
  unit_of_measure_id: id,
  unit: z.string(),
  on_hand: count,
  /** Held for orders being sent. */
  reserved: count,
  /** On hand less reserved: what can be sent now. */
  available: count,
  /** Dispatched to this store by the warehouse and not yet received. */
  incoming: count,
  updated_at: z.string(),
});

export type StockBalance = z.infer<typeof stockBalanceSchema>;

const stockMovementSchema = z.object({
  id,
  store_id: id,
  store_name: z.string(),
  condom_id: id,
  product: z.string(),
  unit_of_measure_id: id,
  unit: z.string(),
  reason: z.enum(MOVEMENT_REASONS),
  /** Positive adds stock, negative removes it. */
  quantity: count,
  on_hand_after: count,
  order_id: nullableId,
  /** Null for system entries such as opening balances. */
  actor_id: nullableId,
  note: z.string().nullable(),
  created_at: z.string(),
});

export type StockMovement = z.infer<typeof stockMovementSchema>;

const hotspotStockSchema = z.object({
  hot_spot_id: id,
  hot_spot_name: z.string().nullable(),
  district_id: nullableId,
  condom_id: id,
  product: z.string(),
  /** Null on the row for open alerts, which have no unit until the DCFP acts. */
  unit_of_measure_id: nullableId,
  unit: z.string().nullable(),
  delivered: count,
  deliveries: count,
  last_delivered_at: z.string().nullable(),
  in_transit: count,
  /** Stockout alerts not yet sent or still waiting for the warehouse. */
  open_alerts: count,
  on_hold_requests: count,
  last_stockout_at: z.string(),
});

export type HotspotStock = z.infer<typeof hotspotStockSchema>;

export interface DispatchInput {
  rider_id: string;
  unit_of_measure_id: string;
  quantity_issued: number;
}

export interface ReplenishmentInput {
  warehouse_store_id: string;
  unit_of_measure_id: string;
  quantity: number;
}

export interface ReceiveInput {
  quantity_received: number;
  /** Required when the count differs from what was sent. */
  discrepancy_note: string | null;
}

export interface MovementInput {
  store_id: string;
  condom_id: string;
  unit_of_measure_id: string;
  reason: RecordableReason;
  /** Positive for a receipt; nonzero for an adjustment. */
  quantity: number;
  /** Required for an adjustment. */
  note: string | null;
}

export interface MovementFilter {
  reason: MovementReason | null;
  /** `YYYY-MM-DD`, inclusive. */
  from: string | null;
  to: string | null;
  page: number;
}

export interface MovementPage {
  movements: StockMovement[];
  /** The page was full, so there may be another. */
  hasMore: boolean;
}

const ORDER_PAGE_SIZE = 100;
/** 1,000 orders of one status. A district's open work is far less; history can reach it. */
const ORDER_MAX_PAGES = 10;
export const MOVEMENT_PAGE_SIZE = 50;

const orderPath = (orderId: string) => `/orders/${encodeURIComponent(orderId)}`;

/**
 * Every order the caller can see with `status` (or any status), newest first.
 * `GET /orders` filters by status only and gives no total, so this reads page
 * by page; `complete` is false when the cap was reached.
 */
export async function listAllOrders(
  http: HttpClient,
  status: OrderStatus | null,
  signal?: AbortSignal,
): Promise<AllPages<Order>> {
  return readAllPages(
    async (offset, limit) => {
      const query = new URLSearchParams({ limit: String(limit), offset: String(offset) });
      if (status) query.set('status', status);
      return parseList(orderSchema, await http.get(`/orders?${query}`, { signal }), 'orders');
    },
    { pageSize: ORDER_PAGE_SIZE, maxPages: ORDER_MAX_PAGES, pagesAtOnce: 2 },
  );
}

export async function getOrder(
  http: HttpClient,
  orderId: string,
  signal?: AbortSignal,
): Promise<Order> {
  return parseBody(orderSchema, await http.get(orderPath(orderId), { signal }), 'order');
}

/** The order's 50 most recent steps, newest first. */
export async function listOrderEvents(
  http: HttpClient,
  orderId: string,
  signal?: AbortSignal,
): Promise<OrderEvent[]> {
  return parseList(
    orderEventSchema,
    await http.get(`${orderPath(orderId)}/events`, { signal }),
    'order events',
  );
}

/** The riders who can take deliveries from the caller's store, by name. */
export async function listRiders(http: HttpClient, signal?: AbortSignal): Promise<Rider[]> {
  return parseList(riderSchema, await http.get('/orders/riders', { signal }), 'riders');
}

/** The caller's store's balances, one row per product and unit. */
export async function listStock(http: HttpClient, signal?: AbortSignal): Promise<StockBalance[]> {
  return parseList(stockBalanceSchema, await http.get('/inventory/stock', { signal }), 'stock');
}

/** One page of the caller's store's ledger, newest first. */
export async function listMovements(
  http: HttpClient,
  filter: MovementFilter,
  signal?: AbortSignal,
): Promise<MovementPage> {
  const query = new URLSearchParams({
    limit: String(MOVEMENT_PAGE_SIZE),
    offset: String(filter.page * MOVEMENT_PAGE_SIZE),
  });
  if (filter.reason) query.set('reason', filter.reason);
  if (filter.from) query.set('from', filter.from);
  if (filter.to) query.set('to', filter.to);
  const movements = parseList(
    stockMovementSchema,
    await http.get(`/inventory/movements?${query}`, { signal }),
    'stock movements',
  );
  return { movements, hasMore: movements.length === MOVEMENT_PAGE_SIZE };
}

/** What each hotspot in the caller's district has been sent, per product and unit. */
export async function listHotspotStock(
  http: HttpClient,
  signal?: AbortSignal,
): Promise<HotspotStock[]> {
  return parseList(
    hotspotStockSchema,
    await http.get('/inventory/hotspots', { signal }),
    'hotspot stock',
  );
}

/** Sends stock for a stockout alert from the district store's available balance. */
export async function dispatchAlert(
  http: HttpClient,
  alertId: string,
  input: DispatchInput,
): Promise<Order> {
  try {
    return parseBody(
      orderSchema,
      await http.post(`${orderPath(alertId)}/actions/dispatch`, input),
      'order',
    );
  } catch (error) {
    throw explainOrderError('dispatch', error);
  }
}

/** Asks a national warehouse for stock for an alert, which then waits on hold. Returns the request. */
export async function requestReplenishment(
  http: HttpClient,
  alertId: string,
  input: ReplenishmentInput,
): Promise<Order> {
  try {
    return parseBody(
      orderSchema,
      await http.post(`${orderPath(alertId)}/actions/request-replenishment`, input),
      'order',
    );
  } catch (error) {
    throw explainOrderError('request-replenishment', error);
  }
}

/** Records what arrived for a dispatched warehouse request, crediting the district store. */
export async function receiveRequest(
  http: HttpClient,
  requestId: string,
  { quantity_received, discrepancy_note }: ReceiveInput,
): Promise<Order> {
  // The API refuses a blank note, so none is sent when there is nothing to explain.
  const body = discrepancy_note ? { quantity_received, discrepancy_note } : { quantity_received };
  try {
    return parseBody(
      orderSchema,
      await http.post(`${orderPath(requestId)}/actions/receive`, body),
      'order',
    );
  } catch (error) {
    throw explainOrderError('receive', error);
  }
}

/** Records a receipt or an adjustment in the store's ledger. */
export async function recordMovement(
  http: HttpClient,
  input: MovementInput,
): Promise<StockMovement> {
  try {
    return parseBody(
      stockMovementSchema,
      await http.post('/inventory/movements', input),
      'stock movement',
    );
  } catch (error) {
    throw explainMovementError(error);
  }
}

export type DistrictOrderAction = 'dispatch' | 'request-replenishment' | 'receive';

/*
 * The API refuses several different things with the same status, and says
 * which in its message. These are the messages' fixed parts
 * (`backend/internal/features/orders/workflow.go`, `inventory/handler.go`).
 */
const NOT_ENOUGH_STOCK = 'not enough available stock';
const NO_DISTRICT_STORE = 'hotspot has no district';
const MISSING_RECORD = 'does not exist';

function explained(cause: ApiError, message: string, field?: string): ApiError {
  return new ApiError({
    kind: cause.kind,
    status: cause.status,
    message,
    fieldErrors: field ? { [field]: [message] } : cause.fieldErrors,
    cause,
  });
}

/**
 * A refused order action in the DCFP's words, attached to the form field it
 * concerns where there is one. Failures that are not refusals pass through.
 */
export function explainOrderError(action: DistrictOrderAction, error: unknown): ApiError {
  const cause = toApiError(error);
  const said = cause.message;
  switch (cause.kind) {
    case 'conflict':
      if (action === 'dispatch' && said.includes(NOT_ENOUGH_STOCK)) {
        return explained(
          cause,
          'The district store does not have that much available. Send less, or ask the warehouse.',
          'quantity_issued',
        );
      }
      if (action === 'request-replenishment') {
        return explained(
          cause,
          'This alert already has an open warehouse request, or it is no longer waiting. Reload to see where it is now.',
        );
      }
      return explained(
        cause,
        action === 'receive'
          ? 'This request is no longer waiting to be received. Reload to see where it is now.'
          : 'This alert has already been dealt with. Reload to see where it is now.',
      );
    case 'validation':
      if (said.includes(NO_DISTRICT_STORE)) {
        return explained(
          cause,
          "This hotspot's district has no store, so stock cannot be sent to it. Ask an administrator to set the hotspot's district.",
        );
      }
      if (said.includes(MISSING_RECORD)) {
        return explained(
          cause,
          'Something you chose no longer exists. Reload the page and choose again.',
        );
      }
      if (action === 'dispatch') {
        return explained(
          cause,
          'That rider cannot take deliveries from your store. Choose a rider from the list.',
          'rider_id',
        );
      }
      if (action === 'receive') {
        return explained(
          cause,
          'The count differs from what was sent. Say what happened to the difference.',
          'discrepancy_note',
        );
      }
      return explained(cause, 'Choose a national warehouse, a unit and a quantity of at least 1.');
    case 'forbidden':
      return explained(
        cause,
        'This order belongs to another store, or your account cannot do this.',
      );
    case 'not_found':
      return explained(cause, 'This order no longer exists, or you can no longer see it.');
    default:
      return cause;
  }
}

/** A refused stock record in the DCFP's words, attached to the field it concerns. */
export function explainMovementError(error: unknown): ApiError {
  const cause = toApiError(error);
  const said = cause.message;
  switch (cause.kind) {
    case 'conflict':
      return explained(
        cause,
        'That would leave less on hand than is held for orders being sent. Record a smaller reduction.',
        'quantity',
      );
    case 'forbidden':
      return explained(cause, 'You can record stock for your own store only.');
    case 'validation':
      if (said.includes('receipt needs')) {
        return explained(
          cause,
          'A receipt adds stock: enter a quantity of at least 1.',
          'quantity',
        );
      }
      if (said.includes('adjustment needs')) {
        return explained(
          cause,
          'An adjustment needs a quantity other than 0 and a note explaining it.',
          'note',
        );
      }
      if (said.includes('note must be')) {
        return explained(cause, 'Use at most 1,000 characters.', 'note');
      }
      return explained(
        cause,
        'The product or unit you chose no longer exists. Reload the page and choose again.',
      );
    default:
      return cause;
  }
}
