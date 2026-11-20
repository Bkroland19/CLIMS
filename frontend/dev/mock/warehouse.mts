/**
 * The warehouse resources for the mock API: district requests as NMS and
 * JMS see them, what the warehouse does with each (open, accept, hold,
 * requeue, dispatch), its stock by batch and its stock movements.
 *
 * None of these exist in the Go API yet. The paths and shapes here are the
 * contract the web client is written against (see `src/features/warehouse/api.ts`
 * and `design/IMPLEMENTATION_PLAN.md`, Phase 5). Replies use the Go API's
 * `{ success, data }` envelope and its `{ message }` error body.
 *
 * The district's own requests live in `fulfilment.mts`; this module acts on
 * those same records, so a request dispatched here can be received there.
 * Requests from the other districts, and the warehouse stock, live here.
 *
 * Rules the real API is expected to enforce, mirrored here so the UI meets
 * them: only new requests can be accepted, a hold needs a reason, expired
 * batches cannot be dispatched, no batch gives more than it holds, and a
 * dispatch never sends more than was requested (less is allowed).
 */

import {
  fulfilmentActivity,
  fulfilmentRequests,
  recordWarehouseActivity,
  type Activity,
  type Lot,
  type Quantities,
  type Reply,
  type WarehouseRequest,
} from './fulfilment.mts';

type Code = 'NMS' | 'JMS';
type Product = 'male' | 'female';
type Body = Record<string, unknown>;

interface Movement {
  at: string;
  reference: string;
  description: string;
  change: Quantities;
  balance: Quantities;
}

interface Store {
  code: Code;
  name: string;
  location: string;
  /** Who acts for the warehouse in the activity feed. */
  user: string;
  min_levels: Quantities;
  lots: Lot[];
  /** Newest first. */
  movements: Movement[];
}

interface OwnEvent {
  store: Code;
  event: Activity;
}

interface State {
  stores: Record<Code, Store>;
  /** Requests from districts other than the one `fulfilment.mts` plays. */
  requests: WarehouseRequest[];
  activity: OwnEvent[];
  seq: { activity: number };
}

const PRODUCTS: readonly Product[] = ['male', 'female'];
const PRODUCT_LABEL: Record<Product, string> = { male: 'Male', female: 'Female' };
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const MONTH_MS = 30.44 * DAY;

/** A timestamp `minutes` before the server started, so "Today" stays today. */
const ago = (minutes: number): string => new Date(Date.now() - minutes * MINUTE).toISOString();
/** A calendar date `months` from now (negative for the past), so expiry dates keep their meaning. */
const monthsAhead = (months: number): string =>
  new Date(Date.now() + months * MONTH_MS).toISOString().slice(0, 10);
const now = (): string => new Date().toISOString();

const qty = (male: number, female: number): Quantities => ({ male, female });
const describe = (quantities: Quantities): string =>
  PRODUCTS.filter((product) => quantities[product] > 0)
    .map((product) => `${PRODUCT_LABEL[product]} ${quantities[product].toLocaleString('en-US')}`)
    .join(' · ') || 'nothing';

const lot = (
  product: Product,
  batch: string,
  manufactured: string,
  expiresInMonths: number,
  quantity: number,
): Lot => ({
  product,
  batch,
  manufactured_on: manufactured,
  expires_on: monthsAhead(expiresInMonths),
  quantity,
});

const stockOf = (lots: readonly Lot[]): Quantities => {
  const total = qty(0, 0);
  for (const entry of lots) total[entry.product] += entry.quantity;
  return total;
};

const isExpired = (entry: Lot): boolean => new Date(entry.expires_on).getTime() <= Date.now();

/** Movements, newest first, with each balance worked back from the stock held now. */
function withBalances(
  lots: readonly Lot[],
  changes: readonly Omit<Movement, 'balance'>[],
): Movement[] {
  let balance = stockOf(lots);
  return changes.map((change) => {
    const movement = { ...change, balance };
    balance = qty(balance.male - change.change.male, balance.female - change.change.female);
    return movement;
  });
}

function request(
  id: string,
  warehouse: Code,
  district: string,
  by: string,
  items: Quantities,
  status: WarehouseRequest['status'],
  createdMinutesAgo: number,
  extra: Partial<WarehouseRequest> = {},
): WarehouseRequest {
  return {
    id,
    warehouse,
    district,
    requested_by: by,
    items,
    linked_orders: [],
    note: null,
    status,
    created_at: ago(createdMinutesAgo),
    hold_reason: null,
    dispatch: null,
    receipt: null,
    ...extra,
  };
}

function demoState(): State {
  const nmsLots = [
    lot('male', 'ENG-2011-003', '2020-11-02', -0.6, 5000),
    lot('male', 'ENG-2112-007', '2021-12-03', 1.4, 20000),
    lot('male', 'ENG-2205-019', '2022-05-16', 5.3, 60000),
    lot('male', 'ENG-2310-044', '2023-10-09', 22, 140000),
    lot('male', 'ENG-2409-117', '2024-09-23', 33, 244000),
    lot('female', 'FC2-2203-012', '2022-03-14', 3.3, 2000),
    lot('female', 'FC2-2408-044', '2024-08-05', 32, 9200),
  ];
  const jmsLots = [
    lot('male', 'ENG-2203-010', '2022-03-01', 2.2, 3000),
    lot('male', 'ENG-2301-052', '2023-01-18', 13, 40000),
    lot('male', 'ENG-2407-088', '2024-07-08', 31, 104000),
    lot('female', 'FC2-2209-015', '2022-09-12', -1.2, 150),
    lot('female', 'FC2-2405-031', '2024-05-20', 29, 300),
  ];

  const jinjaLines = [
    lot('male', 'ENG-2310-044', '2023-10-09', 22, 10000),
    lot('female', 'FC2-2408-044', '2024-08-05', 32, 500),
  ];
  const masakaLines = [
    lot('male', 'ENG-2310-044', '2023-10-09', 22, 8000),
    lot('female', 'FC2-2408-044', '2024-08-05', 32, 400),
  ];

  const requests = [
    request('WR-2026-0031', 'JMS', 'Gulu', 'Okot Denis', qty(8000, 0), 'sent', 200, {
      note: 'Two landing sites in Bobi are out of stock.',
    }),
    request('WR-2026-0030', 'NMS', 'Mukono', 'Harriet Achieng', qty(12000, 600), 'queued', 1300),
    request(
      'WR-2026-0028',
      'NMS',
      'Mbarara',
      'Ruth Atuhaire',
      qty(20000, 1000),
      'under_review',
      500,
      {
        linked_orders: ['ORD-0311', 'ORD-0314'],
      },
    ),
    request('WR-2026-0027', 'JMS', 'Lira', 'Geoffrey Opio', qty(5000, 400), 'on_hold', 3200, {
      hold_reason: 'Awaiting supplier delivery',
    }),
    request('WR-2026-0026', 'NMS', 'Jinja', 'Mary Nabirye', qty(10000, 500), 'dispatched', 3000, {
      dispatch: {
        dispatched_at: ago(900),
        waybill: 'WB-NMS-26-1185',
        vehicle: 'UAX 233K',
        driver: 'Isaac Mutebi',
        items: qty(10000, 500),
        lines: jinjaLines,
      },
    }),
    request('WR-2026-0025', 'NMS', 'Masaka', 'Peter Ssenyonga', qty(8000, 400), 'received', 21000, {
      dispatch: {
        dispatched_at: ago(20000),
        waybill: 'WB-NMS-26-1171',
        vehicle: 'UBF 903T',
        driver: 'Robert Ssali',
        items: qty(8000, 400),
        lines: masakaLines,
      },
      receipt: {
        received_at: ago(18500),
        received_by: 'Peter Ssenyonga',
        grn: 'GRN-MSK-2026-009',
        accepted: qty(8000, 400),
        store_after: qty(9200, 520),
        lines: masakaLines.map((line) => ({
          ...line,
          on_waybill: line.quantity,
          counted: line.quantity,
          damaged: 0,
          condition: 'Intact',
          accepted: line.quantity,
        })),
        discrepancy: null,
      },
    }),
  ];

  const NMS_USER = 'Daniel Ochieng';
  const JMS_USER = 'Paul Ssekandi';
  const dcfp = (minutes: number, actor: string, text: string, reference: string) =>
    ({ minutes, actor, role: 'dcfp', label: 'DCFP', text, reference }) as const;
  const staff = (minutes: number, store: Code, text: string, reference: string | null) =>
    ({
      minutes,
      actor: store === 'NMS' ? NMS_USER : JMS_USER,
      role: 'warehouse',
      label: store,
      text,
      reference,
    }) as const;
  const events = [
    dcfp(200, 'Okot Denis', 'Requested Male 8,000 from JMS', 'WR-2026-0031'),
    dcfp(1300, 'Harriet Achieng', 'Requested Male 12,000 · Female 600 from NMS', 'WR-2026-0030'),
    staff(1100, 'NMS', 'Accepted the request and queued it for picking', 'WR-2026-0030'),
    dcfp(500, 'Ruth Atuhaire', 'Requested Male 20,000 · Female 1,000 from NMS', 'WR-2026-0028'),
    staff(420, 'NMS', 'Opened the request for review', 'WR-2026-0028'),
    dcfp(3200, 'Geoffrey Opio', 'Requested Male 5,000 · Female 400 from JMS', 'WR-2026-0027'),
    staff(3000, 'JMS', 'Accepted the request and queued it for picking', 'WR-2026-0027'),
    staff(2880, 'JMS', 'Put on hold — awaiting supplier delivery', 'WR-2026-0027'),
    dcfp(3000, 'Mary Nabirye', 'Requested Male 10,000 · Female 500 from NMS', 'WR-2026-0026'),
    staff(2700, 'NMS', 'Accepted the request and queued it for picking', 'WR-2026-0026'),
    staff(
      900,
      'NMS',
      'Dispatched Male 10,000 · Female 500 on waybill WB-NMS-26-1185',
      'WR-2026-0026',
    ),
    dcfp(21000, 'Peter Ssenyonga', 'Requested Male 8,000 · Female 400 from NMS', 'WR-2026-0025'),
    staff(20500, 'NMS', 'Accepted the request and queued it for picking', 'WR-2026-0025'),
    staff(
      20000,
      'NMS',
      'Dispatched Male 8,000 · Female 400 on waybill WB-NMS-26-1171',
      'WR-2026-0025',
    ),
    dcfp(
      18500,
      'Peter Ssenyonga',
      'Received and verified — GRN-MSK-2026-009 issued',
      'WR-2026-0025',
    ),
    staff(8600, 'NMS', 'Received a supplier delivery — Male 100,000 · Female 5,000', null),
    staff(12000, 'JMS', 'Received a supplier delivery — Male 50,000', null),
  ];
  const storeOf = (reference: string | null, label: string): Code =>
    label === 'NMS' || label === 'JMS'
      ? label
      : (requests.find((candidate) => candidate.id === reference)?.warehouse ?? 'NMS');

  return {
    stores: {
      NMS: {
        code: 'NMS',
        name: 'National Medical Stores',
        location: 'Entebbe',
        user: NMS_USER,
        min_levels: qty(200000, 10000),
        lots: nmsLots,
        movements: withBalances(nmsLots, [
          {
            at: ago(240),
            reference: 'WR-2026-0032',
            description: 'Dispatched to Wakiso district store on WB-NMS-26-1187',
            change: qty(-6000, -300),
          },
          {
            at: ago(900),
            reference: 'WR-2026-0026',
            description: 'Dispatched to Jinja district store on WB-NMS-26-1185',
            change: qty(-10000, -500),
          },
          {
            at: ago(8600),
            reference: 'SUP-NMS-2611-04',
            description: 'Received from supplier',
            change: qty(100000, 5000),
          },
          {
            at: ago(20000),
            reference: 'WR-2026-0025',
            description: 'Dispatched to Masaka district store on WB-NMS-26-1171',
            change: qty(-8000, -400),
          },
        ]),
      },
      JMS: {
        code: 'JMS',
        name: 'Joint Medical Store',
        location: 'Kampala',
        user: JMS_USER,
        min_levels: qty(100000, 2000),
        lots: jmsLots,
        movements: withBalances(jmsLots, [
          {
            at: ago(12000),
            reference: 'SUP-JMS-2611-02',
            description: 'Received from supplier',
            change: qty(50000, 0),
          },
          {
            at: ago(44600),
            reference: 'WR-2026-0029',
            description: 'Dispatched to Wakiso district store on WB-JMS-26-0412',
            change: qty(-6000, -200),
          },
        ]),
      },
    },
    requests,
    activity: events.map((entry, index) => ({
      store: storeOf(entry.reference, entry.label),
      event: {
        id: `WEV-${String(index + 1)}`,
        at: ago(entry.minutes),
        actor: entry.actor,
        role: entry.role,
        role_label: entry.label,
        text: entry.text,
        reference: entry.reference,
      },
    })),
    seq: { activity: events.length },
  };
}

/** The demo data plus a record that breaks layouts: a long district, a long note, nothing female. */
function worstState(): State {
  const state = demoState();
  state.requests.unshift(
    request(
      'WR-2026-0099-WITH-A-LONG-IDENTIFIER',
      'NMS',
      'Kasangati–Gayaza Road Weekly Market Catchment (Wakiso North)',
      'Wolfeschlegelsteinhausenbergerdorff-Nalubwama',
      qty(9_999_000, 0),
      'sent',
      2,
      { note: '<img src=x onerror=alert(1)>' },
    ),
  );
  return state;
}

function emptyState(): State {
  const empty = (code: Code, name: string, location: string, user: string): Store => ({
    code,
    name,
    location,
    user,
    min_levels: code === 'NMS' ? qty(200000, 10000) : qty(100000, 2000),
    lots: [],
    movements: [],
  });
  return {
    stores: {
      NMS: empty('NMS', 'National Medical Stores', 'Entebbe', 'Daniel Ochieng'),
      JMS: empty('JMS', 'Joint Medical Store', 'Kampala', 'Paul Ssekandi'),
    },
    requests: [],
    activity: [],
    seq: { activity: 0 },
  };
}

const STATES = { demo: demoState, worst: worstState, empty: emptyState };

let state: State = demoState();

/** Seeds the warehouse data for a dataset name. Unknown names fall back to the demo. */
export function seedWarehouse(dataset: string): void {
  state = Object.hasOwn(STATES, dataset) ? STATES[dataset as keyof typeof STATES]() : demoState();
}

const ok = (data: unknown): Reply => ({ status: 200, body: { success: true, data } });
const fail = (status: number, message: string, errors?: Record<string, string>): Reply => ({
  status,
  body: { success: false, message, ...(errors ? { error: errors } : {}) },
});

function isRecord(value: unknown): value is Body {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isProduct(value: unknown): value is Product {
  return value === 'male' || value === 'female';
}

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/** Every request to `code`, the district's and the others', newest first. */
function requestsAt(code: Code): WarehouseRequest[] {
  return [...fulfilmentRequests(), ...state.requests]
    .filter((candidate) => candidate.warehouse === code)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

const isShared = (target: WarehouseRequest): boolean => fulfilmentRequests().includes(target);

/** Records a warehouse action where the requesting district will see it. */
function record(store: Store, target: WarehouseRequest, message: string): void {
  if (isShared(target)) {
    recordWarehouseActivity(store.user, store.code, message, target.id);
    return;
  }
  state.seq.activity += 1;
  state.activity.push({
    store: store.code,
    event: {
      id: `WEV-${String(state.seq.activity)}`,
      at: now(),
      actor: store.user,
      role: 'warehouse',
      role_label: store.code,
      text: message,
      reference: target.id,
    },
  });
}

function activityAt(code: Code): Activity[] {
  const shared = new Set(
    fulfilmentRequests()
      .filter((candidate) => candidate.warehouse === code)
      .map((candidate) => candidate.id),
  );
  return [
    ...fulfilmentActivity().filter(
      (event) => event.reference !== null && shared.has(event.reference),
    ),
    ...state.activity.filter((entry) => entry.store === code).map((entry) => entry.event),
  ].sort((a, b) => b.at.localeCompare(a.at));
}

const STATUS_WORDS: Record<WarehouseRequest['status'], string> = {
  sent: 'new',
  under_review: 'under review',
  queued: 'queued',
  on_hold: 'on hold',
  dispatched: 'already dispatched',
  received: 'already received',
};

function dispatch(store: Store, target: WarehouseRequest, body: Body): Reply {
  if (target.status !== 'queued') {
    return fail(
      409,
      `${target.id} is ${STATUS_WORDS[target.status]}; only a queued request can be dispatched.`,
    );
  }
  const waybill = text(body.waybill);
  const vehicle = text(body.vehicle);
  const driver = text(body.driver);
  const errors: Record<string, string> = {};
  if (!waybill) errors.waybill = 'Enter the waybill number';
  if (!vehicle) errors.vehicle = 'Enter the vehicle registration';
  if (!driver) errors.driver = "Enter the driver's name";
  if (Object.keys(errors).length > 0) return fail(422, 'Record the waybill and transport.', errors);
  if (!Array.isArray(body.lines) || body.lines.length === 0) {
    return fail(422, 'Pick at least one batch to dispatch.');
  }

  const taking = new Map<Lot, number>();
  const items = qty(0, 0);
  for (const pick of body.lines) {
    if (!isRecord(pick) || !isProduct(pick.product))
      return fail(422, 'Each batch line needs a product.');
    const quantity = Number(pick.quantity);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return fail(422, 'Batch quantities must be whole numbers above zero.');
    }
    const entry = store.lots.find(
      (candidate) => candidate.product === pick.product && candidate.batch === pick.batch,
    );
    if (!entry) return fail(422, `Batch ${String(pick.batch)} is not held at ${store.code}.`);
    if (isExpired(entry))
      return fail(422, `Batch ${entry.batch} has expired and cannot be dispatched.`);
    const total = (taking.get(entry) ?? 0) + quantity;
    if (total > entry.quantity) {
      return fail(
        422,
        `Batch ${entry.batch} has only ${entry.quantity.toLocaleString('en-US')} pieces.`,
      );
    }
    taking.set(entry, total);
    items[pick.product] += quantity;
  }
  for (const product of PRODUCTS) {
    if (items[product] > target.items[product]) {
      return fail(
        422,
        `That is more ${PRODUCT_LABEL[product].toLowerCase()} condoms than ${target.district} requested.`,
      );
    }
  }

  const lines: Lot[] = [];
  for (const [entry, quantity] of taking) {
    entry.quantity -= quantity;
    lines.push({ ...entry, quantity });
  }
  store.lots = store.lots.filter((entry) => entry.quantity > 0);
  store.movements.unshift({
    at: now(),
    reference: target.id,
    description: `Dispatched to ${target.district} district store on ${waybill}`,
    change: qty(-items.male, -items.female),
    balance: stockOf(store.lots),
  });
  target.status = 'dispatched';
  target.dispatch = { dispatched_at: now(), waybill, vehicle, driver, items, lines };
  record(
    store,
    target,
    `Dispatched ${describe(items)} on waybill ${waybill} — ${String(lines.length)} batch line${lines.length === 1 ? '' : 's'}, first-expiry-first-out`,
  );
  return ok(target);
}

function act(store: Store, target: WarehouseRequest, action: string, body: Body): Reply {
  const isNew = target.status === 'sent' || target.status === 'under_review';
  switch (action) {
    case 'open':
      if (target.status === 'sent') {
        target.status = 'under_review';
        record(store, target, 'Opened the request for review');
      }
      return ok(target);
    case 'accept':
      if (!isNew) {
        return fail(
          409,
          `${target.id} is ${STATUS_WORDS[target.status]}; only a new request can be accepted.`,
        );
      }
      target.status = 'queued';
      record(store, target, 'Accepted the request and queued it for picking');
      return ok(target);
    case 'hold': {
      if (!isNew && target.status !== 'queued') {
        return fail(
          409,
          `${target.id} is ${STATUS_WORDS[target.status]} and cannot be put on hold.`,
        );
      }
      const reason = text(body.reason);
      if (!reason)
        return fail(422, 'Say why the request is on hold.', { reason: 'Choose a reason' });
      target.status = 'on_hold';
      target.hold_reason = reason;
      record(store, target, `Put on hold — ${reason.toLowerCase()}`);
      return ok(target);
    }
    case 'requeue':
      if (target.status !== 'on_hold') {
        return fail(409, `${target.id} is ${STATUS_WORDS[target.status]}, not on hold.`);
      }
      target.status = 'queued';
      target.hold_reason = null;
      record(store, target, 'Returned the request to the queue to re-check stock');
      return ok(target);
    case 'dispatch':
      return dispatch(store, target, body);
    default:
      return fail(404, 'Not found');
  }
}

/**
 * Answers a request for one of the warehouse resources, or returns null when
 * the path is not one of them. `parts` is the path after `/api/v1`, split on `/`.
 */
export function handleWarehouse(
  method: string,
  parts: readonly string[],
  body: Body,
): Reply | null {
  const [resource, code, collection, id, action] = parts;
  if (resource !== 'warehouses') return null;
  if (code !== 'NMS' && code !== 'JMS')
    return fail(404, `Warehouse ${String(code)} was not found.`);
  const store = state.stores[code];

  switch (collection) {
    case 'stock':
      if (method !== 'GET' || id) return fail(405, 'Method not allowed');
      return ok({
        code: store.code,
        name: store.name,
        location: store.location,
        stock: stockOf(store.lots),
        min_levels: store.min_levels,
        batches: [...store.lots].sort((a, b) => a.expires_on.localeCompare(b.expires_on)),
        movements: store.movements,
      });
    case 'activity':
      return method === 'GET' && !id ? ok(activityAt(code)) : fail(405, 'Method not allowed');
    case 'requests': {
      if (!id) return method === 'GET' ? ok(requestsAt(code)) : fail(405, 'Method not allowed');
      const target = requestsAt(code).find((candidate) => candidate.id === id);
      if (!target) return fail(404, `Request ${id} is not at ${code}.`);
      if (!action) return method === 'GET' ? ok(target) : fail(405, 'Method not allowed');
      return method === 'POST' ? act(store, target, action, body) : fail(405, 'Method not allowed');
    }
    default:
      return fail(404, 'Not found');
  }
}
