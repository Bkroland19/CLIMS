/**
 * Stock for the mock API, in the Go API's shapes (docs/modules/inventory.md): batches per store,
 * product and unit, each with an optional batch number and expiry date, and the balances they add
 * up to.
 *
 * - `GET /inventory/stock?store_id=&condom_id=`: balances, with reserved and available.
 * - `GET /inventory/batches?store_id=&condom_id=`: batches with stock, first expiry first out.
 * - `GET /inventory/movements?store_id=` and `POST /inventory/movements`: the ledger, and a
 *   delivery (`receipt`) into a batch or an `adjustment` of one, with a note.
 *
 * The order mock (`dcfp.mts`) reserves, dispatches and receives through the functions exported
 * here, so a dispatch takes stock from the warehouse's batches and the district's receipt adds
 * it to batches there. Dates are relative to today, so the shelf-life bands stay meaningful.
 */
import { mockProductId, mockUnitId } from './admin.mts';
import { MOCK_STORES, mockDistrictStoreId } from './hotspots.mts';

interface Reply {
  status: number;
  body: unknown;
}

export interface Batch {
  id: string;
  store_id: string;
  condom_id: string;
  unit_of_measure_id: string;
  batch_number: string | null;
  expiry_date: string | null;
  on_hand: number;
  created_at: string;
}

const ok = (data: unknown, status = 200): Reply => ({ status, body: { success: true, data } });
const fail = (status: number, message: string): Reply => ({
  status,
  body: { success: false, message },
});

const id = (n: number) => `00000000-0000-4000-8400-${String(n).padStart(12, '0')}`;
const DAY = 86_400_000;
const dateOf = (date: Date) => date.toISOString().slice(0, 10);
const day = (offset: number) => dateOf(new Date(Date.now() + offset * DAY));
const months = (n: number) => {
  const date = new Date();
  date.setUTCMonth(date.getUTCMonth() + n);
  return dateOf(date);
};

const NMS = MOCK_STORES.find((store) => store.code === 'nms')?.id ?? '';
const JMS = MOCK_STORES.find((store) => store.code === 'jms')?.id ?? '';
const WAKISO = mockDistrictStoreId('Wakiso') ?? '';

/** Product names and categories as the API reports them, for the products the seed holds. */
const PRODUCTS: Record<string, { name: string; category: 'male' | 'female' }> = {
  [mockProductId(1)]: { name: 'Engabu Free Male', category: 'male' },
  [mockProductId(2)]: { name: 'Engabu Free Male', category: 'male' },
  [mockProductId(3)]: { name: 'Engabu Free Male', category: 'male' },
  [mockProductId(4)]: { name: 'FC2 Free Female', category: 'female' },
  [mockProductId(5)]: { name: 'FC2 Free Female', category: 'female' },
};
const UNIT_NAMES: Record<string, string> = {
  [mockUnitId(1)]: 'Piece',
  [mockUnitId(2)]: 'Box',
  [mockUnitId(3)]: 'Carton',
};

export interface Movement {
  id: string;
  store_id: string;
  condom_id: string;
  unit_of_measure_id: string;
  reason: 'opening' | 'receipt' | 'adjustment' | 'dispatch' | 'order_receipt';
  quantity: number;
  on_hand_after: number;
  order_id: string | null;
  note: string | null;
  batch_number: string | null;
  expiry_date: string | null;
  created_at: string;
}

const ACTOR = '00000000-0000-4000-8002-000000000009';

const state = {
  batches: [] as Batch[],
  movements: [] as Movement[],
  /** Reserved for confirmed orders, by `store|product|unit`. */
  reserved: new Map<string, number>(),
  next: 1,
};

const keyOf = (storeId: string, condomId: string, unitId: string) =>
  `${storeId}|${condomId}|${unitId}`;

function batch(
  n: number,
  store: string,
  product: number,
  unit: number,
  number: string | null,
  expiry: string | null,
  onHand: number,
): Batch {
  return {
    id: id(n),
    store_id: store,
    condom_id: mockProductId(product),
    unit_of_measure_id: mockUnitId(unit),
    batch_number: number,
    expiry_date: expiry,
    on_hand: onHand,
    created_at: new Date(Date.now() - (30 + n) * DAY).toISOString(),
  };
}

export function seedInventory(dataset: string): void {
  state.next = 100;
  state.reserved = new Map();
  state.movements = [];
  if (dataset === 'empty') {
    state.batches = [];
    return;
  }
  state.batches = [
    // NMS: FC2 boxes in every shelf-life band, and Engabu boxes.
    batch(1, NMS, 5, 2, 'FC2-2311-090', day(-20), 40),
    batch(2, NMS, 5, 2, 'FC2-2405-002', day(18), 60),
    batch(3, NMS, 5, 2, 'FC2-2408-071', months(2), 120),
    batch(4, NMS, 5, 2, 'FC2-2502-118', months(20), 600),
    batch(5, NMS, 2, 2, 'ENG-2501-020', months(24), 2000),
    batch(6, NMS, 2, 2, 'ENG-2406-777', months(4), 300),
    // JMS: Engabu boxes, some recorded without batch details.
    batch(7, JMS, 2, 2, 'ENG-2410-501', months(18), 400),
    batch(8, JMS, 2, 2, null, null, 150),
    batch(9, JMS, 5, 2, 'FC2-2501-310', months(14), 250),
    // Wakiso district store, from the order it received.
    batch(10, WAKISO, 2, 2, null, null, 990),
  ];
  // Each batch arrived as a delivery, oldest first, so the ledger accounts for what is held.
  const running = new Map<string, number>();
  for (const b of [...state.batches].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    const key = keyOf(b.store_id, b.condom_id, b.unit_of_measure_id);
    running.set(key, (running.get(key) ?? 0) + b.on_hand);
    const entry = log(
      b.store_id,
      b.condom_id,
      b.unit_of_measure_id,
      b.batch_number ? 'receipt' : 'opening',
      b.on_hand,
      { note: b.batch_number ? 'Delivery from the supplier' : 'Opening balance', batch: b },
      b.created_at,
    );
    entry.on_hand_after = running.get(key) ?? b.on_hand;
  }
  if (dataset === 'worst') {
    state.batches.push(
      batch(
        99,
        NMS,
        5,
        2,
        'A-BATCH-NUMBER-AS-LONG-AS-THE-API-ALLOWS-0123456789-ABCDEFGH',
        months(30),
        1_000_000_000,
      ),
    );
  }
}

function onHandOf(storeId: string, condomId: string, unitId: string): number {
  return state.batches
    .filter(
      (b) => b.store_id === storeId && b.condom_id === condomId && b.unit_of_measure_id === unitId,
    )
    .reduce((sum, b) => sum + b.on_hand, 0);
}

/** Adds a ledger entry after the stock it records has changed. */
export function log(
  storeId: string,
  condomId: string,
  unitId: string,
  reason: Movement['reason'],
  quantity: number,
  extra: { note?: string | null; orderId?: string; batch?: Batch } = {},
  at = new Date().toISOString(),
): Movement {
  const entry: Movement = {
    id: `00000000-0000-4000-8401-${String((state.next += 1)).padStart(12, '0')}`,
    store_id: storeId,
    condom_id: condomId,
    unit_of_measure_id: unitId,
    reason,
    quantity,
    on_hand_after: onHandOf(storeId, condomId, unitId),
    order_id: extra.orderId ?? null,
    note: extra.note ?? null,
    batch_number: extra.batch?.batch_number ?? null,
    expiry_date: extra.batch?.expiry_date ?? null,
    created_at: at,
  };
  state.movements.unshift(entry);
  return entry;
}

/** Shelf life left in calendar months, as the API bands it. */
export function bandOf(expiry: string | null): string {
  if (expiry === null) return 'unknown';
  if (expiry < day(0)) return 'expired';
  if (expiry < months(1)) return 'under_1_month';
  if (expiry < months(3)) return 'under_3_months';
  if (expiry < months(6)) return 'under_6_months';
  return 'ok';
}

function daysLeft(expiry: string | null): number | null {
  if (expiry === null) return null;
  return Math.round((Date.parse(expiry) - Date.parse(day(0))) / DAY);
}

function storeOf(storeId: string) {
  return MOCK_STORES.find((store) => store.id === storeId);
}

function present(b: Batch) {
  const store = storeOf(b.store_id);
  const product = PRODUCTS[b.condom_id];
  return {
    id: b.id,
    store_id: b.store_id,
    store_name: store?.name ?? 'Store',
    store_type: store?.store_type ?? 'district',
    condom_id: b.condom_id,
    product: product?.name ?? 'Condoms',
    category: product?.category ?? null,
    unit_of_measure_id: b.unit_of_measure_id,
    unit: UNIT_NAMES[b.unit_of_measure_id] ?? 'Unit',
    batch_number: b.batch_number,
    expiry_date: b.expiry_date,
    days_remaining: daysLeft(b.expiry_date),
    band: bandOf(b.expiry_date),
    on_hand: b.on_hand,
    created_at: b.created_at,
  };
}

/** First expiry first out: earliest expiry first, unknown expiry last, then oldest first. */
function firstExpiry(a: Batch, b: Batch): number {
  if (a.expiry_date !== b.expiry_date) {
    if (a.expiry_date === null) return 1;
    if (b.expiry_date === null) return -1;
    return a.expiry_date < b.expiry_date ? -1 : 1;
  }
  return a.created_at.localeCompare(b.created_at);
}

function held(storeId: string, condomId: string, unitId: string): Batch[] {
  return state.batches
    .filter(
      (b) => b.store_id === storeId && b.condom_id === condomId && b.unit_of_measure_id === unitId,
    )
    .sort(firstExpiry);
}

/** What check-stock can still reserve: on hand less reserved and expired stock. */
export function reservableFor(storeId: string, condomId: string, unitId: string): number {
  const batches = held(storeId, condomId, unitId);
  const usable = batches
    .filter((b) => bandOf(b.expiry_date) !== 'expired')
    .reduce((sum, b) => sum + b.on_hand, 0);
  return Math.max(usable - (state.reserved.get(keyOf(storeId, condomId, unitId)) ?? 0), 0);
}

export function reserve(storeId: string, condomId: string, unitId: string, quantity: number): void {
  const key = keyOf(storeId, condomId, unitId);
  state.reserved.set(key, Math.max((state.reserved.get(key) ?? 0) + quantity, 0));
}

export interface Take {
  batch_number: string | null;
  expiry_date: string | null;
  quantity: number;
}

/**
 * Plans taking `quantity` first expiry first out, skipping expired batches: null when the
 * unexpired batches are short, else the takes and whether one has under a month left.
 */
export function planTake(
  storeId: string,
  condomId: string,
  unitId: string,
  quantity: number,
): { takes: (Take & { batch: Batch })[]; nearExpiry: boolean } | null {
  const takes: (Take & { batch: Batch })[] = [];
  let left = quantity;
  for (const b of held(storeId, condomId, unitId)) {
    if (left === 0) break;
    if (b.on_hand <= 0 || bandOf(b.expiry_date) === 'expired') continue;
    const take = Math.min(left, b.on_hand);
    takes.push({
      batch: b,
      batch_number: b.batch_number,
      expiry_date: b.expiry_date,
      quantity: take,
    });
    left -= take;
  }
  if (left > 0) return null;
  return {
    takes,
    nearExpiry: takes.some((take) => bandOf(take.expiry_date) === 'under_1_month'),
  };
}

/** Takes the planned stock out of its batches. */
export function take(takes: readonly (Take & { batch: Batch })[]): Take[] {
  return takes.map(({ batch: b, ...rest }) => {
    b.on_hand -= rest.quantity;
    return rest;
  });
}

/** Adds stock to the store's batch with this number and expiry, creating it when there is none. */
export function addTo(
  storeId: string,
  condomId: string,
  unitId: string,
  number: string | null,
  expiry: string | null,
  quantity: number,
): Batch {
  let found = state.batches.find(
    (b) =>
      b.store_id === storeId &&
      b.condom_id === condomId &&
      b.unit_of_measure_id === unitId &&
      b.batch_number === number &&
      b.expiry_date === expiry,
  );
  if (!found) {
    found = {
      id: id((state.next += 1)),
      store_id: storeId,
      condom_id: condomId,
      unit_of_measure_id: unitId,
      batch_number: number,
      expiry_date: expiry,
      on_hand: 0,
      created_at: new Date().toISOString(),
    };
    state.batches.push(found);
  }
  found.on_hand += quantity;
  return found;
}

function balances(query: URLSearchParams) {
  const storeId = query.get('store_id');
  const condomId = query.get('condom_id');
  const keys = new Map<string, Batch>();
  for (const b of state.batches) {
    if (storeId && b.store_id !== storeId) continue;
    if (condomId && b.condom_id !== condomId) continue;
    keys.set(keyOf(b.store_id, b.condom_id, b.unit_of_measure_id), b);
  }
  return [...keys.entries()].map(([key, sample]) => {
    const onHand = held(sample.store_id, sample.condom_id, sample.unit_of_measure_id).reduce(
      (sum, b) => sum + b.on_hand,
      0,
    );
    const reserved = state.reserved.get(key) ?? 0;
    const store = storeOf(sample.store_id);
    return {
      store_id: sample.store_id,
      store_name: store?.name ?? 'Store',
      store_type: store?.store_type ?? 'district',
      district_id: store?.district_id ?? null,
      district_name: store?.district_name ?? null,
      condom_id: sample.condom_id,
      product: PRODUCTS[sample.condom_id]?.name ?? 'Condoms',
      unit_of_measure_id: sample.unit_of_measure_id,
      unit: UNIT_NAMES[sample.unit_of_measure_id] ?? 'Unit',
      on_hand: onHand,
      reserved,
      available: onHand - reserved,
      incoming: 0,
      updated_at: new Date(Date.now() - 2 * DAY).toISOString(),
    };
  });
}

function presentMovement(m: Movement) {
  return {
    ...m,
    store_name: storeOf(m.store_id)?.name ?? 'Store',
    product: PRODUCTS[m.condom_id]?.name ?? 'Condoms',
    unit: UNIT_NAMES[m.unit_of_measure_id] ?? 'Unit',
    actor_id: ACTOR,
  };
}

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

/** Like the Go API: a delivery into a batch, or an adjustment of one with a note. */
function record(body: Record<string, unknown>): Reply {
  const storeId = text(body.store_id);
  const condomId = text(body.condom_id);
  const unitId = text(body.unit_of_measure_id);
  const reason = text(body.reason);
  const quantity = body.quantity;
  const note = text(body.note) || null;
  const number = text(body.batch_number) || null;
  const expiry = text(body.expiry_date) || null;
  if (!storeId || !condomId || !unitId) return fail(422, 'store, product and unit are required');
  if (typeof quantity !== 'number' || !Number.isInteger(quantity)) {
    return fail(422, 'quantity must be a whole number');
  }
  if (reason === 'receipt' && quantity <= 0)
    return fail(422, 'a receipt needs a positive quantity');
  if (reason === 'adjustment' && (quantity === 0 || !note)) {
    return fail(422, 'an adjustment needs a nonzero quantity and a note explaining it');
  }
  if (reason !== 'receipt' && reason !== 'adjustment') {
    return fail(422, 'reason must be receipt or adjustment');
  }
  const reserved = state.reserved.get(keyOf(storeId, condomId, unitId)) ?? 0;
  if (onHandOf(storeId, condomId, unitId) + quantity < reserved) {
    return fail(409, 'adjustment would leave less stock on hand than is reserved for open orders');
  }
  let batch: Batch;
  if (quantity > 0) {
    batch = addTo(storeId, condomId, unitId, number, expiry, quantity);
  } else {
    const found = state.batches.find(
      (b) =>
        b.store_id === storeId &&
        b.condom_id === condomId &&
        b.unit_of_measure_id === unitId &&
        b.batch_number === number &&
        b.expiry_date === expiry,
    );
    if (!found || found.on_hand < -quantity) {
      return fail(409, 'the batch holds less than the quantity to remove');
    }
    found.on_hand += quantity;
    batch = found;
  }
  const entry = log(storeId, condomId, unitId, reason, quantity, { note, batch });
  return ok(presentMovement(entry), 201);
}

/** Answers `/inventory/…`, or returns null for any other path. */
export function handleInventory(
  method: string,
  parts: string[],
  query: URLSearchParams,
  body: Record<string, unknown> = {},
): Reply | null {
  const [resource, target] = parts;
  if (resource !== 'inventory') return null;
  if (target === 'movements') {
    if (method === 'POST') return record(body);
    if (method === 'GET') {
      const storeId = query.get('store_id');
      const limit = Math.min(Number(query.get('limit') ?? 50) || 50, 100);
      return ok(
        state.movements
          .filter((m) => !storeId || m.store_id === storeId)
          .slice(0, limit)
          .map(presentMovement),
      );
    }
  }
  if (method === 'GET' && target === 'stock') return ok(balances(query));
  if (method === 'GET' && target === 'batches') {
    const storeId = query.get('store_id');
    const condomId = query.get('condom_id');
    return ok(
      state.batches
        .filter(
          (b) =>
            (!storeId || b.store_id === storeId) &&
            (!condomId || b.condom_id === condomId) &&
            b.on_hand > 0,
        )
        .sort(
          (a, b) =>
            a.store_id.localeCompare(b.store_id) ||
            a.condom_id.localeCompare(b.condom_id) ||
            a.unit_of_measure_id.localeCompare(b.unit_of_measure_id) ||
            firstExpiry(a, b),
        )
        .map(present),
    );
  }
  return fail(404, 'Not found');
}
