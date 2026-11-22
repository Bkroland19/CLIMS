/**
 * Stockout alerts, warehouse requests and the district store for the mock API, on the Go API's
 * paths, shapes and rules (`backend/internal/features/{orders,inventory}`,
 * `docs/modules/orders.md`, `docs/modules/inventory.md`):
 *
 *   GET  /orders?status=&limit=&offset=       newest first; alerts, requests and legacy orders
 *   GET  /orders/:id, /orders/:id/events?offset=
 *   POST /orders/:id/actions/:action          dispatch, request-replenishment, receive
 *   GET  /orders/riders?store_id=
 *   GET  /inventory/stock, /inventory/hotspots, /inventory/movements
 *   POST /inventory/movements                 a receipt or an adjustment
 *
 * The signed-in user works as Wakiso's DCFP here: reads are scoped to Wakiso's district store,
 * and the steps they take are recorded under their id, as the API scopes by the account's
 * store. Steps that belong to the warehouse (review, check-stock, a request's dispatch) or to
 * the rider (deliver) are refused as the API refuses a DCFP. The seed plays them out through the
 * same workflow code, so every status is on screen and every balance matches its ledger.
 *
 * Not served: placing orders (`POST /orders`, `POST /orders/stockouts`), the legacy
 * `PATCH /orders/:id/fulfill`, the national `/inventory/summary` (a DCFP gets its 403) and the
 * deprecated `/orders/notifications`; no web screen uses them. What the API would send the
 * DCFP goes to the inbox in `notifications.mts`.
 *
 * These orders are not shared with `fulfilment.mts`: the warehouse and MOH workspaces still
 * run on the old `/hotspot-orders` contract and see neither these orders nor this stock.
 */

import {
  MOCK_CATALOGUE,
  SIGNED_IN_USER_ID,
  mockProductLabel,
  mockRidersAt,
  mockUnitName,
  mockUserIdByName,
} from './admin.mts';
import type { Reply } from './fulfilment.mts';
import {
  MOCK_STORES,
  mockDistrictStoreId,
  mockHotspotById,
  mockHotspotByName,
} from './hotspots.mts';
import { notify } from './notifications.mts';

type Body = Record<string, unknown>;
type Status =
  | 'pending'
  | 'fulfilled'
  | 'queued'
  | 'reviewed'
  | 'on_hold'
  | 'confirmed'
  | 'dispatched'
  | 'received'
  | 'delivered';
type Reason = 'opening' | 'receipt' | 'adjustment' | 'dispatch' | 'order_receipt';

interface Order {
  id: string;
  condom_id: string;
  quantity_needed: number | null;
  quantity_issued: number | null;
  order_status: Status;
  order_date: string;
  ordered_by_id: string;
  handled_by_id: string | null;
  ordered_for_store_id: string;
  ordered_from_store_id: string;
  unit_of_measure_id: string | null;
  comment: string | null;
  created_at: string;
  updated_at: string;
  hot_spot_id: string | null;
  parent_order_id: string | null;
  rider_id: string | null;
  quantity_received: number | null;
  discrepancy_note: string | null;
  delivery_note: string | null;
}

interface OrderEvent {
  id: string;
  order_id: string;
  actor_id: string;
  action: string;
  status: Status;
  created_at: string;
}

/** A store's stock of one product in one unit (`order_store_stock`). */
interface Balance {
  store_id: string;
  condom_id: string;
  unit_of_measure_id: string;
  on_hand: number;
  reserved: number;
  updated_at: string;
}

interface Movement {
  id: string;
  store_id: string;
  condom_id: string;
  unit_of_measure_id: string;
  reason: Reason;
  quantity: number;
  on_hand_after: number;
  order_id: string | null;
  actor_id: string | null;
  note: string | null;
  created_at: string;
}

/** `POST /orders/:id/actions/:action` as the API decodes it; a missing or null field is unset. */
interface ActionInput {
  warehouse_store_id?: string;
  rider_id?: string;
  unit_of_measure_id?: string;
  quantity?: number;
  quantity_received?: number;
  quantity_issued?: number;
  discrepancy_note?: string;
  delivery_note?: string;
}

interface MovementInput {
  store_id: string;
  condom_id: string;
  unit_of_measure_id: string;
  reason: string;
  quantity: number;
  note: string | null;
}

/** The signed-in user, recorded on the steps they take. */
const ME = String(SIGNED_IN_USER_ID);
/** The signed-in DCFP's store: Wakiso's district store. */
const MY_STORE = mockDistrictStoreId('Wakiso') ?? '';
const NMS = MOCK_STORES.find((store) => store.code === 'nms')?.id ?? '';
const JMS = MOCK_STORES.find((store) => store.code === 'jms')?.id ?? '';

const state = {
  orders: [] as Order[],
  events: [] as OrderEvent[],
  balances: [] as Balance[],
  movements: [] as Movement[],
  sequence: 0,
};

/** A stable UUID-shaped id: `kind` 0 is an order, 1 an event, 2 a movement. */
function nextId(kind: 0 | 1 | 2): string {
  state.sequence += 1;
  return `00000000-0000-4000-${String(8400 + kind)}-${String(state.sequence).padStart(12, '0')}`;
}

const ok = (data: unknown, status = 200, message = ''): Reply => ({
  status,
  body: message ? { success: true, message, data } : { success: true, data },
});
const fail = (status: number, message: string): Reply => ({
  status,
  body: { success: false, message },
});
const isReply = (value: Order | Reply): value is Reply => 'body' in value;

// The workflow's refusals, worded as `orders/workflow.go` words them.
const conflict = () => fail(409, 'action is unavailable in the current order state');
const forbidden = () => fail(403, 'this action is outside your assignment');
const badInput = () => fail(422, 'action requires valid shipment or receipt details');
const notEnoughStock = () =>
  fail(409, 'not enough available stock at the district store; request it from the warehouse');
const orderNotFound = () => fail(404, 'order not found');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Go's `request.ParseUUID`: a 36-character UUID that is not all zeros. */
const isId = (value: string): boolean =>
  UUID.test(value) && /[1-9a-f]/i.test(value.replaceAll('-', ''));

const byNewest = <T extends { created_at: string; id: string }>(a: T, b: T) =>
  b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id);

const storeOf = (id: string) => MOCK_STORES.find((store) => store.id === id);

// ---------------------------------------------------------------- stock and the ledger

function balanceOf(storeId: string, condomId: string, unitId: string): Balance | undefined {
  return state.balances.find(
    (row) =>
      row.store_id === storeId && row.condom_id === condomId && row.unit_of_measure_id === unitId,
  );
}

/** The balance row, created empty when the store has never held the product in that unit. */
function openBalance(storeId: string, condomId: string, unitId: string, at: string): Balance {
  const existing = balanceOf(storeId, condomId, unitId);
  if (existing) return existing;
  const created = {
    store_id: storeId,
    condom_id: condomId,
    unit_of_measure_id: unitId,
    on_hand: 0,
    reserved: 0,
    updated_at: at,
  };
  state.balances.push(created);
  return created;
}

/** Changes a balance and writes the change to the ledger. */
function move(
  stock: Balance,
  reason: Reason,
  quantity: number,
  details: { orderId?: string; actorId: string | null; note?: string | null; at: string },
): Movement {
  stock.on_hand += quantity;
  stock.updated_at = details.at;
  const movement: Movement = {
    id: nextId(2),
    store_id: stock.store_id,
    condom_id: stock.condom_id,
    unit_of_measure_id: stock.unit_of_measure_id,
    reason,
    quantity,
    on_hand_after: stock.on_hand,
    order_id: details.orderId ?? null,
    actor_id: details.actorId,
    note: details.note ?? null,
    created_at: details.at,
  };
  state.movements.push(movement);
  return movement;
}

// ---------------------------------------------------------------- history and the inbox

/** Whether a notification seeded at `at` has been read: anything older than a day and a half. */
const seenBy = (at: string) => Date.now() - Date.parse(at) > 1.5 * 86_400_000;

/** What the order notifications' templates are written from, stored with each notification. */
interface NotificationData {
  hotspot: string;
  product: string;
  unit: string;
  quantity: number;
  from_store: string;
  to_store: string;
}

/** The notification types that can reach a DCFP, with the API's templates. */
const TEMPLATES: Record<string, (data: NotificationData) => [string, string]> = {
  'order.stockout_reported': (d) => [
    `Stockout at ${d.hotspot}`,
    `${d.hotspot} reported a stockout of ${d.product}. Send stock or request it from the warehouse.`,
  ],
  'order.shipment_dispatched': (d) => [
    `Stock on the way from ${d.from_store}`,
    `${d.from_store} dispatched ${d.quantity} ${d.unit} of ${d.product}. Record the receipt when it arrives.`,
  ],
  'order.shipment_received': (d) => [
    `Stock received at ${d.to_store}`,
    `${d.quantity} ${d.unit} of ${d.product} arrived at ${d.to_store}. Held stockouts can now be sent.`,
  ],
};

/**
 * The notification a step sends the signed-in DCFP, if any (`orders/notifications.go`): a
 * stockout at their store, a shipment dispatched to it, or one received there by someone else.
 * Steps addressed to the warehouse, the rider or the hotspot reach other people.
 */
function notifyMe(order: Order, actorId: string, action: string, at: string): void {
  if (actorId === ME) return;
  const type =
    action === 'stockout_reported' && order.ordered_from_store_id === MY_STORE
      ? 'order.stockout_reported'
      : action === 'dispatch' && order.parent_order_id && order.ordered_for_store_id === MY_STORE
        ? 'order.shipment_dispatched'
        : action === 'receive' && order.ordered_for_store_id === MY_STORE
          ? 'order.shipment_received'
          : null;
  const template = type ? TEMPLATES[type] : undefined;
  if (!type || !template) return;
  const parent = state.orders.find((candidate) => candidate.id === order.parent_order_id);
  const hotspotId = order.hot_spot_id ?? parent?.hot_spot_id ?? null;
  const quantity =
    action === 'dispatch'
      ? order.quantity_issued
      : action === 'receive'
        ? order.quantity_received
        : order.quantity_needed;
  // As the API words what is missing: a product with no label is "condoms", no unit "units".
  const product = mockProductLabel(order.condom_id);
  const data: NotificationData = {
    hotspot: (hotspotId ? mockHotspotById(hotspotId)?.name : null) ?? 'a hotspot',
    product: product === null || product === '' ? 'condoms' : product,
    unit: (order.unit_of_measure_id ? mockUnitName(order.unit_of_measure_id) : null) ?? 'units',
    quantity: quantity ?? 0,
    from_store: storeOf(order.ordered_from_store_id)?.name ?? '',
    to_store: storeOf(order.ordered_for_store_id)?.name ?? '',
  };
  const [title, body] = template(data);
  notify({
    type,
    title,
    body,
    resource: { type: 'order', id: order.id },
    actorId,
    data: { ...data },
    at,
    read: seenBy(at),
  });
}

/** Writes a step to the order's history and tells the DCFP when it concerns them. */
function record(order: Order, actorId: string, action: string, at: string): void {
  state.events.push({
    id: nextId(1),
    order_id: order.id,
    actor_id: actorId,
    action,
    status: order.order_status,
    created_at: at,
  });
  notifyMe(order, actorId, action, at);
}

// ---------------------------------------------------------------- the workflow

/** A stockout alert as `POST /orders/stockouts` raises it: a product only, at the district store. */
function raiseAlert(
  hotSpotId: string,
  condomId: string,
  by: string,
  at: string,
  comment: string | null,
): Order {
  const alert: Order = {
    id: nextId(0),
    condom_id: condomId,
    quantity_needed: null,
    quantity_issued: null,
    order_status: 'queued',
    order_date: at.slice(0, 10),
    ordered_by_id: by,
    handled_by_id: null,
    ordered_for_store_id: MY_STORE,
    ordered_from_store_id: MY_STORE,
    unit_of_measure_id: null,
    comment,
    created_at: at,
    updated_at: at,
    hot_spot_id: hotSpotId,
    parent_order_id: null,
    rider_id: null,
    quantity_received: null,
    discrepancy_note: null,
    delivery_note: null,
  };
  state.orders.push(alert);
  record(alert, by, 'stockout_reported', at);
  return alert;
}

/**
 * Asks a national warehouse for stock for an open alert, which then waits on hold. A store
 * that is not a national warehouse, or an alert with a request still open, is a conflict.
 */
function requestReplenishment(
  alert: Order,
  actorId: string,
  warehouseId: string,
  unitId: string,
  quantity: number,
  at: string,
): Order | Reply {
  const warehouse = MOCK_STORES.find(
    (store) => store.id === warehouseId && store.store_type === 'national',
  );
  const open = state.orders.some(
    (order) => order.parent_order_id === alert.id && order.order_status !== 'received',
  );
  if (!warehouse || open) return conflict();
  if (mockUnitName(unitId) === null) {
    return fail(422, 'a referenced user, store, product or unit does not exist');
  }
  const request: Order = {
    ...alert,
    id: nextId(0),
    unit_of_measure_id: unitId,
    quantity_needed: quantity,
    order_status: 'queued',
    order_date: at.slice(0, 10),
    ordered_by_id: actorId,
    ordered_for_store_id: alert.ordered_from_store_id,
    ordered_from_store_id: warehouse.id,
    comment: null,
    created_at: at,
    updated_at: at,
    hot_spot_id: null,
    parent_order_id: alert.id,
  };
  state.orders.push(request);
  alert.order_status = 'on_hold';
  alert.updated_at = at;
  record(alert, actorId, 'request-replenishment', at);
  record(request, actorId, 'replenishment_requested', at);
  return request;
}

/** One step of the workflow (`orders/workflow.go`'s `transition`), with no check of who may take it. */
function transition(
  order: Order,
  actorId: string,
  action: string,
  input: ActionInput,
  at: string,
): Order | Reply {
  const alert = order.hot_spot_id !== null;
  const openAlert = alert && (order.order_status === 'queued' || order.order_status === 'on_hold');
  const next: Partial<Order> = {};
  switch (action) {
    case 'review':
      // Only warehouse requests are reviewed; an alert goes straight to the DCFP's decision.
      if (alert || (order.order_status !== 'queued' && order.order_status !== 'on_hold')) {
        return conflict();
      }
      next.order_status = 'reviewed';
      break;
    case 'check-stock': {
      if (alert || (order.order_status !== 'reviewed' && order.order_status !== 'on_hold')) {
        return conflict();
      }
      // Reserves the whole quantity at the warehouse when enough is free, or waits on hold.
      const stock = order.unit_of_measure_id
        ? balanceOf(order.ordered_from_store_id, order.condom_id, order.unit_of_measure_id)
        : undefined;
      const needed = order.quantity_needed ?? 0;
      if (stock && stock.on_hand - stock.reserved >= needed) {
        stock.reserved += needed;
        stock.updated_at = at;
        next.order_status = 'confirmed';
      } else {
        next.order_status = 'on_hold';
      }
      break;
    }
    case 'request-replenishment': {
      if (!openAlert) return conflict();
      const { warehouse_store_id: warehouse, unit_of_measure_id: unit, quantity } = input;
      if (!warehouse || !unit || quantity === undefined) return badInput();
      return requestReplenishment(order, actorId, warehouse, unit, quantity, at);
    }
    case 'dispatch': {
      let quantity: number;
      if (alert) {
        // The DCFP sends from the district's available stock, choosing the unit and quantity.
        if (!openAlert) return conflict();
        const { rider_id: rider, unit_of_measure_id: unit, quantity_issued: issued } = input;
        if (!rider || !unit || issued === undefined) return badInput();
        if (!mockRidersAt(order.ordered_from_store_id).some((person) => person.id === rider)) {
          return badInput();
        }
        const stock = balanceOf(order.ordered_from_store_id, order.condom_id, unit);
        if (!stock || stock.on_hand - stock.reserved < issued) return notEnoughStock();
        quantity = issued;
        move(stock, 'dispatch', -quantity, { orderId: order.id, actorId, at });
        Object.assign(next, { unit_of_measure_id: unit, quantity_needed: issued, rider_id: rider });
      } else {
        // A warehouse request ships what check-stock reserved, or less, releasing the rest.
        if (order.order_status !== 'confirmed') return conflict();
        if (input.rider_id !== undefined || input.unit_of_measure_id !== undefined) {
          return badInput();
        }
        const needed = order.quantity_needed ?? 0;
        quantity = input.quantity_issued ?? needed;
        if (quantity > needed) return badInput();
        const stock = order.unit_of_measure_id
          ? balanceOf(order.ordered_from_store_id, order.condom_id, order.unit_of_measure_id)
          : undefined;
        if (!stock || stock.reserved < needed) return conflict();
        stock.reserved -= needed;
        move(stock, 'dispatch', -quantity, { orderId: order.id, actorId, at });
      }
      Object.assign(next, {
        quantity_issued: quantity,
        handled_by_id: actorId,
        order_status: 'dispatched',
      });
      break;
    }
    case 'receive': {
      if (order.order_status !== 'dispatched' || order.parent_order_id === null) return conflict();
      const received = input.quantity_received ?? 0;
      if (received !== order.quantity_issued && input.discrepancy_note === undefined) {
        return badInput();
      }
      const stock = openBalance(
        order.ordered_for_store_id,
        order.condom_id,
        order.unit_of_measure_id ?? '',
        at,
      );
      if (received > 0) {
        move(stock, 'order_receipt', received, { orderId: order.id, actorId, at });
      }
      Object.assign(next, {
        quantity_received: received,
        discrepancy_note: input.discrepancy_note ?? null,
        order_status: 'received',
      });
      break;
    }
    case 'deliver':
      if (order.order_status !== 'dispatched' || !alert) return conflict();
      Object.assign(next, {
        delivery_note: input.delivery_note ?? null,
        order_status: 'delivered',
      });
      break;
    default:
      return fail(404, 'unknown order action');
  }
  Object.assign(order, next, { updated_at: at });
  record(order, actorId, action, at);
  return order;
}

// ---------------------------------------------------------------- reading requests

const INT32 = 2_147_483_647;
const isWhole = (value: unknown, limit: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && Math.abs(value) <= limit;

/** Go's `strconv.ParseInt` on a query parameter, with the handler's default when it is absent. */
function intParam(raw: string | null, fallback: number): number | null {
  if (raw === null || raw === '') return fallback;
  return /^[+-]?\d+$/.test(raw) ? Number(raw) : null;
}

/** An optional UUID query parameter: undefined when absent, null when malformed. */
function idParam(query: URLSearchParams, name: string): string | null | undefined {
  const raw = query.get(name);
  if (!raw) return undefined;
  return isId(raw) ? raw.toLowerCase() : null;
}

/** `from` and `to` as whole days, both included; a message when either is wrong. */
function period(query: URLSearchParams): { from: number; to: number } | string {
  const bounds = { from: -Infinity, to: Infinity };
  for (const name of ['from', 'to'] as const) {
    const raw = query.get(name);
    if (!raw) continue;
    const start = Date.parse(`${raw}T00:00:00Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(raw) ||
      Number.isNaN(start) ||
      new Date(start).toISOString().slice(0, 10) !== raw
    ) {
      return `${name} must be a YYYY-MM-DD date`;
    }
    bounds[name] = name === 'to' ? start + 86_400_000 : start;
  }
  if (bounds.from >= bounds.to) return 'from must not be after to';
  return bounds;
}

const inPeriod = (at: string, { from, to }: { from: number; to: number }) => {
  const time = Date.parse(at);
  return time >= from && time < to;
};

/** The action body as the API decodes it: unknown fields and wrong types are refused. */
function decodeAction(body: Body): ActionInput | null {
  const texts = [
    'warehouse_store_id',
    'rider_id',
    'unit_of_measure_id',
    'discrepancy_note',
    'delivery_note',
  ] as const;
  const counts = ['quantity', 'quantity_received', 'quantity_issued'] as const;
  const known = new Set<string>([...texts, ...counts]);
  if (Object.keys(body).some((key) => !known.has(key))) return null;
  const input: ActionInput = {};
  for (const key of texts) {
    const value = body[key];
    if (value === undefined || value === null) continue;
    if (typeof value !== 'string') return null;
    input[key] = value;
  }
  for (const key of counts) {
    const value = body[key];
    if (value === undefined || value === null) continue;
    if (!isWhole(value, INT32)) return null;
    input[key] = value;
  }
  return input;
}

/** Which fields each action takes (`validActionInput` in `orders/workflow_handler.go`). */
function validActionInput(action: string, input: ActionInput): boolean {
  for (const key of ['warehouse_store_id', 'rider_id', 'unit_of_measure_id'] as const) {
    const value = input[key];
    if (value === undefined) continue;
    if (!isId(value)) return false;
    input[key] = value.toLowerCase();
  }
  for (const key of ['discrepancy_note', 'delivery_note'] as const) {
    const value = input[key]?.trim();
    if (value === undefined) continue;
    if (!value || new TextEncoder().encode(value).length > 4000) return false;
    input[key] = value;
  }
  const replenish = action === 'request-replenishment';
  const has = (key: keyof ActionInput) => input[key] !== undefined;
  if (
    has('warehouse_store_id') !== replenish ||
    has('quantity') !== replenish ||
    (input.quantity !== undefined && input.quantity < 1) ||
    (has('unit_of_measure_id') && action !== 'dispatch' && !replenish) ||
    has('delivery_note') !== (action === 'deliver') ||
    has('quantity_received') !== (action === 'receive') ||
    (has('rider_id') && action !== 'dispatch') ||
    (input.quantity_issued !== undefined && (action !== 'dispatch' || input.quantity_issued < 1)) ||
    (has('discrepancy_note') && action !== 'receive')
  ) {
    return false;
  }
  return input.quantity_received === undefined || input.quantity_received >= 0;
}

/** The movement body as the API decodes it into `inventory.MovementInput`. */
function decodeMovement(body: Body): MovementInput | null {
  const known = new Set([
    'store_id',
    'condom_id',
    'unit_of_measure_id',
    'reason',
    'quantity',
    'note',
  ]);
  if (Object.keys(body).some((key) => !known.has(key))) return null;
  // A JSON null leaves a Go string empty and a number zero.
  const texts: string[] = [];
  for (const key of ['store_id', 'condom_id', 'unit_of_measure_id', 'reason'] as const) {
    const value = body[key] ?? '';
    if (typeof value !== 'string') return null;
    texts.push(value);
  }
  const [storeId = '', condomId = '', unitId = '', reason = ''] = texts;
  const quantity = body.quantity ?? 0;
  const note = body.note ?? null;
  if (!isWhole(quantity, Number.MAX_SAFE_INTEGER) || (note !== null && typeof note !== 'string')) {
    return null;
  }
  return {
    store_id: storeId,
    condom_id: condomId,
    unit_of_measure_id: unitId,
    reason,
    quantity,
    note,
  };
}

/** `inventory/handler.go`'s `validate`: a message when the movement is invalid. */
function validateMovement(input: MovementInput): string {
  for (const key of ['store_id', 'condom_id', 'unit_of_measure_id'] as const) {
    if (!isId(input[key])) {
      return 'store_id, condom_id and unit_of_measure_id must be nonzero UUIDs';
    }
    input[key] = input[key].toLowerCase();
  }
  // A blank note is no note; the limit counts characters, as Go counts runes.
  const note = input.note?.trim();
  input.note = note === undefined || note === '' ? null : note;
  if (note && Array.from(note).length > 1000) return 'note must be at most 1000 characters';
  if (input.reason === 'receipt') {
    if (input.quantity <= 0) return 'a receipt needs a positive quantity';
  } else if (input.reason === 'adjustment') {
    if (input.quantity === 0 || !input.note) {
      return 'an adjustment needs a nonzero quantity and a note explaining it';
    }
  } else {
    return 'reason must be receipt or adjustment';
  }
  if (Math.abs(input.quantity) > 1_000_000_000) return 'quantity is out of range';
  return '';
}

// ---------------------------------------------------------------- views

/** Orders the DCFP can see: those to or from their store. */
const visibleOrders = () =>
  state.orders.filter(
    (order) =>
      order.ordered_for_store_id === MY_STORE ||
      order.ordered_from_store_id === MY_STORE ||
      order.rider_id === ME,
  );

function balanceView(row: Balance) {
  const store = storeOf(row.store_id);
  const incoming = state.orders
    .filter(
      (order) =>
        order.ordered_for_store_id === row.store_id &&
        order.condom_id === row.condom_id &&
        order.unit_of_measure_id === row.unit_of_measure_id &&
        order.order_status === 'dispatched' &&
        order.parent_order_id !== null,
    )
    .reduce((sum, order) => sum + (order.quantity_issued ?? 0), 0);
  return {
    store_id: row.store_id,
    store_name: store?.name ?? '',
    store_type: store?.store_type ?? 'district',
    district_id: store?.district_id ?? null,
    district_name: store?.district_name ?? null,
    condom_id: row.condom_id,
    product: mockProductLabel(row.condom_id) ?? '',
    unit_of_measure_id: row.unit_of_measure_id,
    unit: mockUnitName(row.unit_of_measure_id) ?? '',
    on_hand: row.on_hand,
    reserved: row.reserved,
    available: row.on_hand - row.reserved,
    incoming,
    updated_at: row.updated_at,
  };
}

function movementView(row: Movement) {
  return {
    id: row.id,
    store_id: row.store_id,
    store_name: storeOf(row.store_id)?.name ?? '',
    condom_id: row.condom_id,
    product: mockProductLabel(row.condom_id) ?? '',
    unit_of_measure_id: row.unit_of_measure_id,
    unit: mockUnitName(row.unit_of_measure_id) ?? '',
    reason: row.reason,
    quantity: row.quantity,
    on_hand_after: row.on_hand_after,
    order_id: row.order_id,
    actor_id: row.actor_id,
    note: row.note,
    created_at: row.created_at,
  };
}

// ---------------------------------------------------------------- handlers

const PAGE_ERROR = 'limit must be between 1 and 100 and offset must be nonnegative';

function listOrders(query: URLSearchParams): Reply {
  const limit = intParam(query.get('limit'), 50);
  const offset = intParam(query.get('offset'), 0);
  if (limit === null || offset === null || limit < 1 || limit > 100 || offset < 0) {
    return fail(400, PAGE_ERROR);
  }
  const status = query.get('status') ?? '';
  const rows = visibleOrders()
    .filter((order) => !status || order.order_status === status)
    .sort(byNewest);
  return ok(rows.slice(offset, offset + limit));
}

function findVisible(id: string): Order | undefined {
  return visibleOrders().find((order) => order.id === id.toLowerCase());
}

function getOrder(id: string): Reply {
  if (!isId(id)) return fail(400, 'id must be a nonzero UUID');
  const order = findVisible(id);
  return order ? ok(order) : orderNotFound();
}

function listEvents(id: string, query: URLSearchParams): Reply {
  if (!isId(id)) return fail(400, 'id must be a nonzero UUID');
  const offset = intParam(query.get('offset'), 0);
  if (offset === null || offset < 0) return fail(400, 'offset must be nonnegative');
  const order = findVisible(id);
  if (!order) return orderNotFound();
  const events = state.events.filter((event) => event.order_id === order.id).sort(byNewest);
  return ok(events.slice(offset, offset + 50));
}

function listRiders(query: URLSearchParams): Reply {
  const storeId = idParam(query, 'store_id');
  if (storeId === null) return fail(400, 'store_id must be a nonzero UUID');
  if (storeId !== undefined && storeId !== MY_STORE) {
    return fail(403, 'riders are listed for your assigned store only');
  }
  const riders = mockRidersAt(MY_STORE).map((rider) => ({
    ...rider,
    open_deliveries: state.orders.filter(
      (order) =>
        order.rider_id === rider.id &&
        order.hot_spot_id !== null &&
        order.order_status === 'dispatched',
    ).length,
  }));
  return ok(riders, 200, 'riders retrieved');
}

/** The permission each action needs. */
const ACTION_PERMISSIONS = new Map([
  ['review', 'orders:process'],
  ['check-stock', 'orders:process'],
  ['dispatch', 'orders:process'],
  ['request-replenishment', 'orders:replenish'],
  ['receive', 'orders:receive'],
  ['deliver', 'orders:deliver'],
]);
/** The order permissions a DCFP holds: no `orders:deliver`. */
const MY_PERMISSIONS = new Set([
  'orders:read',
  'orders:process',
  'orders:replenish',
  'orders:receive',
]);

function performAction(id: string, action: string, body: Body): Reply {
  const permission = ACTION_PERMISSIONS.get(action);
  if (!permission) return fail(404, 'unknown order action');
  if (!MY_PERMISSIONS.has(permission)) return fail(403, 'permission denied');
  if (!isId(id)) return fail(400, 'id must be a nonzero UUID');
  const input = decodeAction(body);
  if (!input) return fail(400, 'invalid request body');
  if (!validActionInput(action, input)) return badInput();
  const order = findVisible(id);
  if (!order) return orderNotFound();
  if (order.hot_spot_id === null && order.parent_order_id === null) return conflict();
  // A DCFP receives at their store and acts on alerts sent from it; the warehouse's steps on a
  // request are taken at the warehouse.
  const expected = action === 'receive' ? order.ordered_for_store_id : order.ordered_from_store_id;
  if (expected !== MY_STORE) return forbidden();
  const result = transition(order, ME, action, input, new Date().toISOString());
  if (isReply(result)) return result;
  return ok(result, action === 'request-replenishment' ? 201 : 200);
}

function listStock(query: URLSearchParams): Reply {
  const storeId = idParam(query, 'store_id');
  if (storeId === null) return fail(400, 'store_id must be a nonzero UUID');
  const condomId = idParam(query, 'condom_id');
  if (condomId === null) return fail(400, 'condom_id must be a nonzero UUID');
  const storeType = query.get('store_type') ?? '';
  if (storeType && storeType !== 'national' && storeType !== 'district') {
    return fail(400, 'store_type must be national or district');
  }
  const rows = state.balances
    .filter(
      (row) =>
        row.store_id === MY_STORE &&
        (!storeId || row.store_id === storeId) &&
        (!condomId || row.condom_id === condomId),
    )
    .map(balanceView)
    .filter((row) => !storeType || row.store_type === storeType)
    .sort(
      (a, b) =>
        Number(a.store_type === 'district') - Number(b.store_type === 'district') ||
        a.store_name.localeCompare(b.store_name) ||
        a.product.localeCompare(b.product) ||
        a.unit.localeCompare(b.unit),
    );
  return ok(rows);
}

interface SupplyRow {
  hot_spot_id: string;
  hot_spot_name: string | null;
  district_id: string | null;
  condom_id: string;
  product: string;
  unit_of_measure_id: string | null;
  unit: string | null;
  delivered: number;
  deliveries: number;
  last_delivered_at: string | null;
  in_transit: number;
  open_alerts: number;
  on_hold_requests: number;
  last_stockout_at: string;
}

const later = (a: string | null, b: string) => (a === null || b > a ? b : a);

/** What each hotspot has been sent through its alerts, per product and unit. */
function hotspotSupply(query: URLSearchParams): Reply {
  const hotSpotId = idParam(query, 'hot_spot_id');
  if (hotSpotId === null) return fail(400, 'hot_spot_id must be a nonzero UUID');
  const condomId = idParam(query, 'condom_id');
  if (condomId === null) return fail(400, 'condom_id must be a nonzero UUID');
  const bounds = period(query);
  if (typeof bounds === 'string') return fail(400, bounds);
  const rows = new Map<string, SupplyRow>();
  for (const order of state.orders) {
    if (order.hot_spot_id === null || order.ordered_from_store_id !== MY_STORE) continue;
    if (
      (hotSpotId && order.hot_spot_id !== hotSpotId) ||
      (condomId && order.condom_id !== condomId)
    ) {
      continue;
    }
    // The API joins each alert to its hotspot.
    const hotspot = mockHotspotById(order.hot_spot_id);
    if (!hotspot) continue;
    const key = `${hotspot.id}|${order.condom_id}|${order.unit_of_measure_id ?? ''}`;
    const row = rows.get(key) ?? {
      hot_spot_id: hotspot.id,
      hot_spot_name: hotspot.name,
      district_id: hotspot.district?.id ?? null,
      condom_id: order.condom_id,
      product: mockProductLabel(order.condom_id) ?? '',
      unit_of_measure_id: order.unit_of_measure_id,
      unit: order.unit_of_measure_id ? mockUnitName(order.unit_of_measure_id) : null,
      delivered: 0,
      deliveries: 0,
      last_delivered_at: null,
      in_transit: 0,
      open_alerts: 0,
      on_hold_requests: 0,
      last_stockout_at: order.created_at,
    };
    rows.set(key, row);
    const issued = order.quantity_issued ?? 0;
    if (order.order_status === 'delivered') {
      row.last_delivered_at = later(row.last_delivered_at, order.updated_at);
      if (inPeriod(order.updated_at, bounds)) {
        row.delivered += issued;
        row.deliveries += 1;
      }
    }
    if (order.order_status === 'dispatched') row.in_transit += issued;
    if (order.order_status === 'queued' || order.order_status === 'on_hold') row.open_alerts += 1;
    if (order.order_status === 'on_hold') row.on_hold_requests += 1;
    row.last_stockout_at = later(row.last_stockout_at, order.created_at);
  }
  const name = (row: SupplyRow) => row.hot_spot_name ?? '￿';
  return ok(
    [...rows.values()].sort(
      (a, b) =>
        name(a).localeCompare(name(b)) ||
        a.product.localeCompare(b.product) ||
        (a.unit === null ? -1 : b.unit === null ? 1 : a.unit.localeCompare(b.unit)),
    ),
  );
}

function listMovements(query: URLSearchParams): Reply {
  const storeId = idParam(query, 'store_id');
  if (storeId === null) return fail(400, 'store_id must be a nonzero UUID');
  const condomId = idParam(query, 'condom_id');
  if (condomId === null) return fail(400, 'condom_id must be a nonzero UUID');
  const reason = query.get('reason') ?? '';
  const reasons = ['opening', 'receipt', 'adjustment', 'dispatch', 'order_receipt'];
  if (reason && !reasons.includes(reason)) return fail(400, 'unknown reason');
  const bounds = period(query);
  if (typeof bounds === 'string') return fail(400, bounds);
  const limit = intParam(query.get('limit'), 50);
  const offset = intParam(query.get('offset'), 0);
  if (limit === null || offset === null || limit < 1 || limit > 100 || offset < 0) {
    return fail(400, PAGE_ERROR);
  }
  const rows = state.movements
    .filter(
      (row) =>
        row.store_id === MY_STORE &&
        (!storeId || row.store_id === storeId) &&
        (!condomId || row.condom_id === condomId) &&
        (!reason || row.reason === reason) &&
        inPeriod(row.created_at, bounds),
    )
    .sort(byNewest);
  return ok(rows.slice(offset, offset + limit).map(movementView));
}

function recordMovement(body: Body): Reply {
  const input = decodeMovement(body);
  if (!input) return fail(400, 'invalid request body');
  const problem = validateMovement(input);
  if (problem) return fail(422, problem);
  if (input.store_id !== MY_STORE) return fail(403, 'this store is outside your assignment');
  if (
    mockProductLabel(input.condom_id) === null ||
    mockUnitName(input.unit_of_measure_id) === null
  ) {
    return fail(422, 'store_id, condom_id or unit_of_measure_id does not exist');
  }
  const existing = balanceOf(input.store_id, input.condom_id, input.unit_of_measure_id);
  if ((existing?.on_hand ?? 0) + input.quantity < (existing?.reserved ?? 0)) {
    return fail(409, 'adjustment would leave less stock on hand than is reserved for open orders');
  }
  const now = new Date().toISOString();
  const stock =
    existing ?? openBalance(input.store_id, input.condom_id, input.unit_of_measure_id, now);
  const reason = input.reason === 'receipt' ? 'receipt' : 'adjustment';
  const movement = move(stock, reason, input.quantity, { actorId: ME, note: input.note, at: now });
  return ok(movementView(movement), 201, 'stock recorded');
}

function handleInventory(
  method: string,
  parts: readonly string[],
  body: Body,
  query: URLSearchParams,
) {
  const [, first, extra] = parts;
  if (extra !== undefined) return fail(404, 'Not found');
  if (first === 'stock' && method === 'GET') return listStock(query);
  if (first === 'hotspots' && method === 'GET') return hotspotSupply(query);
  if (first === 'movements' && method === 'GET') return listMovements(query);
  if (first === 'movements' && method === 'POST') return recordMovement(body);
  if (first === 'summary' && method === 'GET') {
    return fail(403, 'the national summary requires orders:all_stores');
  }
  return fail(404, 'Not found');
}

/** Answers `/orders…` and `/inventory…`, or returns null for any other path. */
export function handleOrders(
  method: string,
  parts: readonly string[],
  body: Body,
  query: URLSearchParams,
): Reply | null {
  const [resource, first, second, third] = parts;
  if (resource === 'inventory') return handleInventory(method, parts, body, query);
  if (resource !== 'orders') return null;
  if (first === undefined) {
    return method === 'GET' ? listOrders(query) : fail(405, 'Method not allowed');
  }
  if (first === 'riders' && second === undefined) {
    return method === 'GET' ? listRiders(query) : fail(405, 'Method not allowed');
  }
  if (second === 'actions' && third !== undefined && parts.length === 4 && method === 'POST') {
    return performAction(first, third, body);
  }
  if (second === 'events' && parts.length === 3 && method === 'GET')
    return listEvents(first, query);
  if (second === undefined && method === 'GET') return getOrder(first);
  return fail(404, 'Not found');
}

// ---------------------------------------------------------------- seed

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

/** A demo account's id; the seed refers to people by name. */
function person(name: string): string {
  const id = mockUserIdByName(name);
  if (!id) throw new Error(`The orders mock needs the demo account ${name}.`);
  return id;
}

function raise(hotspotName: string, condomId: string, by: string, days: number, comment?: string) {
  const hotspot = mockHotspotByName(hotspotName);
  if (!hotspot) throw new Error(`The orders mock needs the seeded hotspot ${hotspotName}.`);
  return raiseAlert(hotspot.id, condomId, by, daysAgo(days), comment ?? null);
}

/** Takes a step as `actorId`, `days` ago; a refused step is a mistake in the seed. */
function step(order: Order, actorId: string, action: string, input: ActionInput, days: number) {
  const result = transition(order, actorId, action, input, daysAgo(days));
  if (isReply(result)) {
    throw new Error(`Seeding ${action} on ${order.id} failed: ${JSON.stringify(result.body)}`);
  }
  return result;
}

/** A balance carried over from the paper stock cards when the store started on CLIMS. */
function opening(
  storeId: string,
  condomId: string,
  unitId: string,
  quantity: number,
  days: number,
) {
  const at = daysAgo(days);
  move(openBalance(storeId, condomId, unitId, at), 'opening', quantity, { actorId: null, at });
}

/**
 * Wakiso's last two months, oldest first so every balance matches its ledger. On screen: three
 * alerts to decide, two held (one the store can now cover, one waiting on a shipment to
 * receive), one with a rider, three delivered, and a request that NMS is short for.
 */
function seedWakiso(): void {
  const { maleBox: male, femalePiece: female, box, piece } = MOCK_CATALOGUE;
  const grace = person('Grace Nakato');
  const ronald = person('Ronald Kizza');
  const joseph = person('Joseph Ssemwogerere');
  const daniel = person('Daniel Ochieng');
  const paul = person('Paul Ssekandi');
  const musa = person('Musa Kato');
  const peter = person('Peter Okello');

  opening(MY_STORE, male, box, 10, 60);
  opening(MY_STORE, female, piece, 200, 60);
  opening(NMS, male, box, 30, 60);
  opening(JMS, female, piece, 2000, 60);

  // Kasenyi: the store was low, so the DCFP asked NMS, received 28 of 30 boxes and sent 6.
  const kasenyi = raise('Kasenyi Landing Site', male, grace, 35, 'Fishermen ask every evening.');
  const restock = step(
    kasenyi,
    ME,
    'request-replenishment',
    { warehouse_store_id: NMS, unit_of_measure_id: box, quantity: 30 },
    34.8,
  );
  step(restock, daniel, 'review', {}, 34);
  step(restock, daniel, 'check-stock', {}, 33.5);
  step(restock, daniel, 'dispatch', {}, 33);
  step(
    restock,
    ME,
    'receive',
    { quantity_received: 28, discrepancy_note: 'Two boxes were crushed in transit.' },
    31,
  );
  step(
    kasenyi,
    ME,
    'dispatch',
    { rider_id: peter, unit_of_measure_id: box, quantity_issued: 6 },
    30.9,
  );
  step(kasenyi, peter, 'deliver', { delivery_note: 'Handed to the landing site chairman.' }, 30);

  const lodge = raise('Namasuba Lodge', female, joseph, 16, 'Guests ask for female condoms.');
  step(
    lodge,
    ME,
    'dispatch',
    { rider_id: peter, unit_of_measure_id: piece, quantity_issued: 200 },
    15.9,
  );
  step(lodge, peter, 'deliver', { delivery_note: 'Received by the lodge manager.' }, 15);

  const market = raise('Katabi Fish Market', male, ronald, 12);
  step(
    market,
    ME,
    'dispatch',
    { rider_id: musa, unit_of_measure_id: box, quantity_issued: 4 },
    11.9,
  );
  step(market, musa, 'deliver', { delivery_note: 'Left with the market master.' }, 11);

  // Held for NMS, which is short; the store has had boxes since, so it can be sent now.
  const held = raise('Namasuba Lodge', male, joseph, 9);
  const short = step(
    held,
    ME,
    'request-replenishment',
    { warehouse_store_id: NMS, unit_of_measure_id: box, quantity: 50 },
    8.9,
  );
  step(short, daniel, 'review', {}, 8);
  move(openBalance(MY_STORE, male, box, daysAgo(7.8)), 'adjustment', -2, {
    actorId: ME,
    note: 'Two boxes water-damaged in the store.',
    at: daysAgo(7.8),
  });
  step(short, daniel, 'check-stock', {}, 7.5);

  // Held for a JMS shipment that is on its way: 450 of the 500 pieces asked for.
  const waiting = raise(
    'Kasenyi Landing Site',
    female,
    grace,
    6,
    'Women at the landing site have asked twice this week.',
  );
  const shipment = step(
    waiting,
    ME,
    'request-replenishment',
    { warehouse_store_id: JMS, unit_of_measure_id: piece, quantity: 500 },
    5.8,
  );
  step(shipment, paul, 'review', {}, 4);
  step(shipment, paul, 'check-stock', {}, 3.5);

  raise(
    'Katabi Fish Market',
    male,
    ronald,
    2,
    'Fishermen leave at 5 a.m.; deliver before then if possible.',
  );
  const sent = raise('Kasenyi Landing Site', male, grace, 2.2, 'Out since Saturday.');
  step(sent, ME, 'dispatch', { rider_id: musa, unit_of_measure_id: box, quantity_issued: 5 }, 1.2);
  step(shipment, paul, 'dispatch', { quantity_issued: 450 }, 1);
  raise('Namasuba Lodge', female, joseph, 0.9);
  raise('Kitende Trading Centre', male, joseph, 0.125, 'The bar owners ask every day.');
}

/** The awkward data real systems hold, on top of Wakiso's demo. */
function seedAwkward(): void {
  const { maleBox, femalePiece, malePiece, legacy, piece } = MOCK_CATALOGUE;
  const joseph = person('Joseph Ssemwogerere');
  // More queued alerts than one page of 100, so the client has to read every page.
  const places = [
    'Kitende Trading Centre',
    'Namasuba Lodge',
    'Katabi Fish Market',
    'Kasenyi Landing Site',
  ];
  for (let n = 0; n < 105; n += 1) {
    raise(places[n % places.length] ?? '', n % 3 ? maleBox : femalePiece, joseph, 20 - n * 0.15);
  }
  const words = 'The hotspot manager wrote a very long comment about the stockout. ';
  raise('Katabi Fish Market', maleBox, joseph, 0.05, words.repeat(62).slice(0, 4000));
  // An alert for a hotspot the hotspot list no longer has, for a deactivated legacy product.
  raiseAlert('00000000-0000-4000-8100-999999999999', legacy, joseph, daysAgo(0.3), null);
  // A legacy order from before the workflow: neither an alert nor a request.
  const at = daysAgo(400);
  state.orders.push({
    id: nextId(0),
    condom_id: maleBox,
    quantity_needed: 100,
    quantity_issued: null,
    order_status: 'pending',
    order_date: at.slice(0, 10),
    ordered_by_id: ME,
    handled_by_id: null,
    ordered_for_store_id: MY_STORE,
    ordered_from_store_id: NMS,
    unit_of_measure_id: MOCK_CATALOGUE.box,
    comment: 'Placed in the old system.',
    created_at: at,
    updated_at: at,
    hot_spot_id: null,
    parent_order_id: null,
    rider_id: null,
    quantity_received: null,
    discrepancy_note: null,
    delivery_note: null,
  });
  opening(MY_STORE, malePiece, piece, 1_234_567, 60);
}

/** Seeds the orders and stock. Seed the inbox, hotspots and accounts first: this reads them. */
export function seedOrdersMock(dataset: string): void {
  state.orders = [];
  state.events = [];
  state.balances = [];
  state.movements = [];
  state.sequence = 0;
  if (dataset === 'empty') return;
  seedWakiso();
  if (dataset === 'worst') seedAwkward();
}
