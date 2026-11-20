/**
 * The district fulfilment resources for the mock API: hotspot orders,
 * warehouse requests, the district store, riders and the activity feed.
 *
 * None of these exist in the Go API yet. The paths and shapes here are the
 * contract the web client is written against (see `src/features/fulfilment/api.ts`
 * and `design/IMPLEMENTATION_PLAN.md`, Phase 4). Replies use the Go API's
 * `{ success, data }` envelope and its `{ message }` error body.
 *
 * Rules the real API is expected to enforce, mirrored here so the UI meets
 * them: stock is issued first-expiry-first-out, expired batches cannot be
 * issued, and an order is only confirmed if the district store can cover it.
 */

export interface Reply {
  status: number;
  body: unknown;
}

type Product = 'male' | 'female';
type Quantities = Record<Product, number>;
type Body = Record<string, unknown>;

interface Lot {
  product: Product;
  batch: string;
  manufactured_on: string;
  expires_on: string;
  quantity: number;
}

interface HotspotSummary {
  id: string;
  name: string;
  kind: string;
  village: string;
  subcounty: string;
  district: string;
  contact_name: string;
  contact_phone: string;
  dispenser: string | null;
  vhts: string[];
}

interface Rider {
  id: string;
  name: string;
  phone: string;
  plate: string;
  status: 'available' | 'on_delivery' | 'off_duty';
}

type OrderStatus =
  'queued' | 'on_hold' | 'confirmed' | 'dispatched' | 'in_transit' | 'delivered' | 'received';

interface Order {
  id: string;
  hotspot: HotspotSummary;
  requested: Quantities;
  approved: Quantities;
  stock_at_hotspot: Quantities | null;
  reason: string;
  note: string | null;
  status: OrderStatus;
  requested_by: { name: string; role: string };
  created_at: string;
  confirmed_at: string | null;
  hold_reason: string | null;
  warehouse_request_id: string | null;
  allocation: Lot[];
  delivery: {
    note_number: string;
    rider: Omit<Rider, 'status'>;
    assigned_at: string;
    collected_at: string | null;
    delivered_at: string | null;
  } | null;
  received_at: string | null;
}

interface ReceiptLine extends Lot {
  on_waybill: number;
  counted: number;
  damaged: number;
  condition: string;
  accepted: number;
}

type RequestStatus = 'sent' | 'under_review' | 'queued' | 'on_hold' | 'dispatched' | 'received';

interface WarehouseRequest {
  id: string;
  warehouse: 'NMS' | 'JMS';
  district: string;
  requested_by: string;
  items: Quantities;
  linked_orders: string[];
  note: string | null;
  status: RequestStatus;
  created_at: string;
  hold_reason: string | null;
  dispatch: {
    dispatched_at: string;
    waybill: string;
    vehicle: string;
    driver: string;
    items: Quantities;
    lines: Lot[];
  } | null;
  receipt: {
    received_at: string;
    received_by: string;
    grn: string;
    accepted: Quantities;
    store_after: Quantities;
    lines: ReceiptLine[];
    discrepancy: { type: string; note: string } | null;
  } | null;
}

interface Movement {
  at: string;
  reference: string;
  description: string;
  change: Quantities;
  balance: Quantities;
}

type ActivityRole = 'hotspot_manager' | 'vht' | 'dcfp' | 'warehouse' | 'rider' | 'moh' | 'system';

interface Activity {
  id: string;
  at: string;
  actor: string;
  role: ActivityRole;
  role_label: string;
  text: string;
  reference: string | null;
}

interface State {
  store: { name: string; district: string; min_levels: Quantities; lots: Lot[] };
  orders: Order[];
  requests: WarehouseRequest[];
  movements: Movement[];
  riders: Rider[];
  activity: Activity[];
  seq: { request: number; note: number; grn: number; activity: number };
}

const PRODUCTS: readonly Product[] = ['male', 'female'];
const PRODUCT_LABEL: Record<Product, string> = { male: 'Male', female: 'Female' };
const DCFP = 'Sarah Namubiru';
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const MONTH_MS = 30.44 * DAY;

/** A timestamp `minutes` before the server started, so "Today" stays today. */
const ago = (minutes: number): string => new Date(Date.now() - minutes * MINUTE).toISOString();
/** A calendar date `months` from now, for expiry dates that keep their meaning. */
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

function hotspot(
  id: string,
  name: string,
  kind: string,
  village: string,
  subcounty: string,
  contact: [string, string],
  dispenser: string | null,
  vhts: string[],
): HotspotSummary {
  return {
    id,
    name,
    kind,
    village,
    subcounty,
    district: 'Wakiso',
    contact_name: contact[0],
    contact_phone: contact[1],
    dispenser,
    vhts,
  };
}

const VHT = 'Joseph Ssemwogerere';
const HOTSPOTS = {
  kasenyi: hotspot(
    'HS-0231',
    'Kasenyi Landing Site',
    'Permanent',
    'Kasenyi',
    'Katabi TC',
    ['Grace Nakato', '+256 772 418 903'],
    'Working',
    [VHT],
  ),
  nansana: hotspot(
    'HS-0198',
    'Nansana Taxi Park',
    'Permanent',
    'Nansana West',
    'Nansana Municipality',
    ['Ronald Kizza', '+256 754 220 118'],
    'Working',
    [],
  ),
  kireka: hotspot(
    'HS-0207',
    'Kireka Truck Stop Lodge',
    'Permanent',
    'Kireka',
    'Kira Municipality',
    ['Agnes Namata', '+256 703 661 245'],
    null,
    [],
  ),
  bwebajja: hotspot(
    'HS-0215',
    'Bwebajja Nite Spot',
    'Permanent',
    'Bwebajja',
    'Kajjansi TC',
    [VHT, '+256 776 902 331'],
    'Working',
    [VHT],
  ),
};

const RIDERS: Rider[] = [
  {
    id: 'R1',
    name: 'Musa Kato',
    phone: '+256 701 334 920',
    plate: 'UFB 412K',
    status: 'available',
  },
  {
    id: 'R2',
    name: 'Peter Okello',
    phone: '+256 782 105 447',
    plate: 'UEK 019D',
    status: 'on_delivery',
  },
  {
    id: 'R3',
    name: 'Brian Mugisha',
    phone: '+256 759 440 812',
    plate: 'UGA 771P',
    status: 'off_duty',
  },
];

function order(
  id: string,
  spot: HotspotSummary,
  requested: Quantities,
  status: OrderStatus,
  minutesAgo: number,
  by: string,
  reason: string,
  extra: Partial<Order> = {},
): Order {
  return {
    id,
    hotspot: spot,
    requested,
    approved: { ...requested },
    stock_at_hotspot: null,
    reason,
    note: null,
    status,
    requested_by: { name: by, role: 'Hotspot manager' },
    created_at: ago(minutesAgo),
    confirmed_at: null,
    hold_reason: null,
    warehouse_request_id: null,
    allocation: [],
    delivery: null,
    received_at: null,
    ...extra,
  };
}

function demoState(): State {
  const longLife = (product: Product, quantity: number): Lot =>
    product === 'male'
      ? lot('male', 'ENG-2407-088', '2024-07-08', 31, quantity)
      : lot('female', 'FC2-2405-031', '2024-05-20', 29, quantity);
  const peter = RIDERS[1] ?? RIDERS[0];
  const musa = RIDERS[0];
  if (!peter || !musa) throw new Error('Rider seed data is missing.');
  const asDeliveryRider = ({ id, name, phone, plate }: Rider) => ({ id, name, phone, plate });

  const orders: Order[] = [
    order(
      'ORD-0141',
      HOTSPOTS.kasenyi,
      qty(800, 40),
      'queued',
      35,
      'Grace Nakato',
      'Out of stock',
      {
        stock_at_hotspot: qty(0, 0),
        note: 'Fishermen back from the lake this weekend.',
      },
    ),
    order(
      'ORD-0139',
      HOTSPOTS.nansana,
      qty(500, 0),
      'queued',
      1080,
      'Ronald Kizza',
      'Running low',
      {
        stock_at_hotspot: qty(120, 22),
      },
    ),
    order(
      'ORD-0140',
      HOTSPOTS.kireka,
      qty(1500, 60),
      'on_hold',
      1560,
      'Agnes Namata',
      'Out of stock',
      { hold_reason: 'District stock not available', stock_at_hotspot: qty(0, 4) },
    ),
    order(
      'ORD-0136',
      HOTSPOTS.nansana,
      qty(2000, 100),
      'on_hold',
      2900,
      'Ronald Kizza',
      'Out of stock',
      { hold_reason: 'District stock not available', warehouse_request_id: 'WR-2026-0032' },
    ),
    order('ORD-0142', HOTSPOTS.bwebajja, qty(300, 20), 'confirmed', 600, VHT, 'Running low', {
      confirmed_at: ago(90),
      allocation: [longLife('male', 300), longLife('female', 20)],
    }),
    order('ORD-0138', HOTSPOTS.bwebajja, qty(400, 20), 'in_transit', 1500, VHT, 'Out of stock', {
      confirmed_at: ago(300),
      allocation: [longLife('male', 400), longLife('female', 20)],
      delivery: {
        note_number: 'DN-2026-0087',
        rider: asDeliveryRider(peter),
        assigned_at: ago(150),
        collected_at: ago(120),
        delivered_at: null,
      },
    }),
    order(
      'ORD-0137',
      HOTSPOTS.nansana,
      qty(600, 40),
      'received',
      5760,
      'Ronald Kizza',
      'Out of stock',
      {
        confirmed_at: ago(5000),
        allocation: [longLife('male', 600), longLife('female', 40)],
        delivery: {
          note_number: 'DN-2026-0085',
          rider: asDeliveryRider(musa),
          assigned_at: ago(4900),
          collected_at: ago(4870),
          delivered_at: ago(4790),
        },
        received_at: ago(4770),
      },
    ),
  ];

  const received29 = [longLife('male', 6000), longLife('female', 200)];
  const requests: WarehouseRequest[] = [
    {
      id: 'WR-2026-0032',
      warehouse: 'NMS',
      district: 'Wakiso',
      requested_by: DCFP,
      items: qty(6000, 300),
      linked_orders: ['ORD-0136'],
      note: 'Nansana taxi park is out of stock.',
      status: 'dispatched',
      created_at: ago(2800),
      hold_reason: null,
      dispatch: {
        dispatched_at: ago(240),
        waybill: 'WB-NMS-26-1187',
        vehicle: 'UBF 903T',
        driver: 'Robert Ssali',
        items: qty(6000, 300),
        lines: [
          lot('male', 'ENG-2409-117', '2024-09-23', 33, 6000),
          lot('female', 'FC2-2408-044', '2024-08-05', 32, 300),
        ],
      },
      receipt: null,
    },
    {
      id: 'WR-2026-0029',
      warehouse: 'JMS',
      district: 'Wakiso',
      requested_by: DCFP,
      items: qty(6000, 200),
      linked_orders: [],
      note: null,
      status: 'received',
      created_at: ago(46000),
      hold_reason: null,
      dispatch: {
        dispatched_at: ago(44600),
        waybill: 'WB-JMS-26-0412',
        vehicle: 'UBJ 220Q',
        driver: 'Moses Ouma',
        items: qty(6000, 200),
        lines: received29,
      },
      receipt: {
        received_at: ago(43200),
        received_by: DCFP,
        grn: 'GRN-WAK-2026-014',
        accepted: qty(6000, 200),
        store_after: qty(8400, 380),
        lines: received29.map((line) => ({
          ...line,
          on_waybill: line.quantity,
          counted: line.quantity,
          damaged: 0,
          condition: 'Intact',
          accepted: line.quantity,
        })),
        discrepancy: null,
      },
    },
  ];

  const lots = [
    lot('male', 'ENG-2206-021', '2022-06-02', 2.4, 400),
    longLife('male', 1000),
    longLife('female', 60),
  ];

  const movements: Movement[] = [
    {
      at: ago(90),
      reference: 'ORD-0142',
      description: 'Allocated to Bwebajja Nite Spot',
      change: qty(-300, -20),
      balance: qty(1400, 60),
    },
    {
      at: ago(300),
      reference: 'ORD-0138',
      description: 'Allocated to Bwebajja Nite Spot',
      change: qty(-400, -20),
      balance: qty(1700, 80),
    },
    {
      at: ago(5000),
      reference: 'ORD-0137',
      description: 'Allocated to Nansana Taxi Park',
      change: qty(-600, -40),
      balance: qty(2100, 100),
    },
    {
      at: ago(43200),
      reference: 'WR-2026-0029',
      description: 'Received from JMS',
      change: qty(6000, 200),
      balance: qty(8400, 380),
    },
  ];

  const event = (
    minutesAgo: number,
    actor: string,
    role: ActivityRole,
    roleLabel: string,
    text: string,
    reference: string,
  ): Omit<Activity, 'id'> => ({
    at: ago(minutesAgo),
    actor,
    role,
    role_label: roleLabel,
    text,
    reference,
  });
  const HM = 'hotspot_manager';
  const events = [
    event(
      5760,
      'Ronald Kizza',
      HM,
      'Hotspot manager',
      'Notified a stockout at Nansana Taxi Park — Male 600 · Female 40',
      'ORD-0137',
    ),
    event(5000, DCFP, 'dcfp', 'DCFP', 'Confirmed Male 600 · Female 40', 'ORD-0137'),
    event(
      4900,
      DCFP,
      'dcfp',
      'DCFP',
      'Handed over to rider Musa Kato with DN-2026-0085',
      'ORD-0137',
    ),
    event(
      4790,
      'Musa Kato',
      'rider',
      'Rider',
      'Delivered — signed delivery note photographed',
      'ORD-0137',
    ),
    event(
      4770,
      'Ronald Kizza',
      HM,
      'Hotspot manager',
      'Confirmed receipt of Male 600 · Female 40',
      'ORD-0137',
    ),
    event(
      46000,
      DCFP,
      'dcfp',
      'DCFP',
      'Requested Male 6,000 · Female 200 from JMS',
      'WR-2026-0029',
    ),
    event(
      44600,
      'Paul Ssekandi',
      'warehouse',
      'JMS',
      'Dispatched on waybill WB-JMS-26-0412',
      'WR-2026-0029',
    ),
    event(
      43200,
      DCFP,
      'dcfp',
      'DCFP',
      'Received and verified — GRN-WAK-2026-014 issued',
      'WR-2026-0029',
    ),
    event(
      2900,
      'Ronald Kizza',
      HM,
      'Hotspot manager',
      'Notified a stockout at Nansana Taxi Park — Male 2,000 · Female 100',
      'ORD-0136',
    ),
    event(2850, DCFP, 'dcfp', 'DCFP', 'Put on hold — district stock not available', 'ORD-0136'),
    event(2800, DCFP, 'dcfp', 'DCFP', 'Requested Male 6,000 · Female 300 from NMS', 'WR-2026-0032'),
    event(
      1900,
      'Daniel Ochieng',
      'warehouse',
      'NMS',
      'Accepted and queued for picking',
      'WR-2026-0032',
    ),
    event(
      1560,
      'Agnes Namata',
      HM,
      'Hotspot manager',
      'Notified a stockout at Kireka Truck Stop Lodge — Male 1,500 · Female 60',
      'ORD-0140',
    ),
    event(
      1500,
      VHT,
      HM,
      'Hotspot manager',
      'Notified a stockout at Bwebajja Nite Spot — Male 400 · Female 20',
      'ORD-0138',
    ),
    event(1380, DCFP, 'dcfp', 'DCFP', 'Put on hold — district stock not available', 'ORD-0140'),
    event(1080, 'Ronald Kizza', HM, 'Hotspot manager', 'Requested stock — Male 500', 'ORD-0139'),
    event(
      600,
      VHT,
      'vht',
      'VHT',
      'Requested stock for Bwebajja Nite Spot — Male 300 · Female 20',
      'ORD-0142',
    ),
    event(300, DCFP, 'dcfp', 'DCFP', 'Confirmed Male 400 · Female 20', 'ORD-0138'),
    event(
      240,
      'Daniel Ochieng',
      'warehouse',
      'NMS',
      'Dispatched on waybill WB-NMS-26-1187',
      'WR-2026-0032',
    ),
    event(
      150,
      DCFP,
      'dcfp',
      'DCFP',
      'Handed over to rider Peter Okello with DN-2026-0087',
      'ORD-0138',
    ),
    event(
      120,
      'Peter Okello',
      'rider',
      'Rider',
      'Collected the stock and delivery note',
      'ORD-0138',
    ),
    event(90, DCFP, 'dcfp', 'DCFP', 'Confirmed Male 300 · Female 20', 'ORD-0142'),
    event(
      35,
      'Grace Nakato',
      HM,
      'Hotspot manager',
      'Notified a stockout at Kasenyi Landing Site — Male 800 · Female 40',
      'ORD-0141',
    ),
  ];

  return {
    store: {
      name: 'Wakiso district store',
      district: 'Wakiso',
      min_levels: qty(5000, 300),
      lots,
    },
    orders,
    requests,
    movements,
    riders: structuredClone(RIDERS),
    activity: events.map((entry, index) => ({ id: `EV-${String(index + 1)}`, ...entry })),
    seq: { request: 32, note: 87, grn: 14, activity: events.length },
  };
}

/** The demo data plus the records that break layouts: long names, zeroes, an empty hold reason. */
function worstState(): State {
  const state = demoState();
  const long = hotspot(
    'HS-9999-LONG-IDENTIFIER',
    'Kasangati–Gayaza Road Weekly Market and Boda-Boda Stage (behind the fuel station)',
    'Temporary',
    'Kasangati Town Council Ward Seven',
    'Kasangati Town Council',
    ['Wolfeschlegelsteinhausenbergerdorff-Nalubwama', '+256 (0) 772-000-000'],
    null,
    ['VHT-with-an-unbroken-very-long-name-for-testing', 'عائشة'],
  );
  state.orders.unshift(
    order('ORD-9999', long, qty(9_999_000, 0), 'queued', 2, 'X', 'Out of stock', {
      note: '<img src=x onerror=alert(1)>',
    }),
    order('ORD-9998', long, qty(0, 0), 'on_hold', 60, 'Jo', 'Running low', { hold_reason: '' }),
  );
  return state;
}

function emptyState(): State {
  return {
    store: {
      name: 'Wakiso district store',
      district: 'Wakiso',
      min_levels: qty(5000, 300),
      lots: [],
    },
    orders: [],
    requests: [],
    movements: [],
    riders: [],
    activity: [],
    seq: { request: 0, note: 0, grn: 0, activity: 0 },
  };
}

const STATES = { demo: demoState, worst: worstState, empty: emptyState };

let state: State = demoState();

/** Seeds the fulfilment data for a dataset name. Unknown names fall back to the demo. */
export function seedFulfilment(dataset: string): void {
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

function readQuantities(value: unknown): Quantities | null {
  if (!isRecord(value)) return null;
  const male = Number(value.male ?? 0);
  const female = Number(value.female ?? 0);
  if (![male, female].every((n) => Number.isInteger(n) && n >= 0)) return null;
  return { male, female };
}

function isProduct(value: unknown): value is Product {
  return value === 'male' || value === 'female';
}

const storeStock = (): Quantities => {
  const total = qty(0, 0);
  for (const entry of state.store.lots) total[entry.product] += entry.quantity;
  return total;
};

const isExpired = (entry: Lot): boolean => new Date(entry.expires_on).getTime() <= Date.now();

/** Free stock that can be issued: everything not expired. */
const issuableStock = (): Quantities => {
  const total = qty(0, 0);
  for (const entry of state.store.lots)
    if (!isExpired(entry)) total[entry.product] += entry.quantity;
  return total;
};

function record(
  actor: string,
  role: ActivityRole,
  roleLabel: string,
  text: string,
  reference: string,
): void {
  state.seq.activity += 1;
  state.activity.push({
    id: `EV-${String(state.seq.activity)}`,
    at: now(),
    actor,
    role,
    role_label: roleLabel,
    text,
    reference,
  });
}

/**
 * Takes stock out of the store for an order. Uses the caller's batch picks
 * when given, otherwise first-expiry-first-out. Returns an error message, or
 * the lines taken.
 */
function allocate(needed: Quantities, picks: unknown): Lot[] | string {
  const available = issuableStock();
  for (const product of PRODUCTS) {
    if (needed[product] > available[product]) {
      return `Not enough ${PRODUCT_LABEL[product].toLowerCase()} condoms in the district store: ${available[product].toLocaleString('en-US')} available, ${needed[product].toLocaleString('en-US')} needed.`;
    }
  }

  const plan: { entry: Lot; take: number }[] = [];
  if (Array.isArray(picks) && picks.length > 0) {
    const picked = qty(0, 0);
    for (const pick of picks) {
      if (!isRecord(pick) || !isProduct(pick.product)) return 'Each batch pick needs a product.';
      const take = Number(pick.quantity);
      if (!Number.isInteger(take) || take < 0) return 'Batch quantities must be whole numbers.';
      if (take === 0) continue;
      const entry = state.store.lots.find(
        (candidate) => candidate.product === pick.product && candidate.batch === pick.batch,
      );
      if (!entry) return `Batch ${String(pick.batch)} is not in the district store.`;
      if (isExpired(entry)) return `Batch ${entry.batch} has expired and cannot be issued.`;
      if (take > entry.quantity)
        return `Batch ${entry.batch} has only ${String(entry.quantity)} pieces.`;
      picked[pick.product] += take;
      plan.push({ entry, take });
    }
    for (const product of PRODUCTS) {
      if (picked[product] !== needed[product]) {
        return `The ${PRODUCT_LABEL[product].toLowerCase()} batch picks add up to ${String(picked[product])}, not ${String(needed[product])}.`;
      }
    }
  } else {
    for (const product of PRODUCTS) {
      let remaining = needed[product];
      const lots = state.store.lots
        .filter((entry) => entry.product === product && !isExpired(entry))
        .sort((a, b) => a.expires_on.localeCompare(b.expires_on));
      for (const entry of lots) {
        if (remaining <= 0) break;
        const take = Math.min(remaining, entry.quantity);
        plan.push({ entry, take });
        remaining -= take;
      }
    }
  }

  const lines = plan.map(({ entry, take }) => {
    entry.quantity -= take;
    return { ...entry, quantity: take };
  });
  state.store.lots = state.store.lots.filter((entry) => entry.quantity > 0);
  return lines;
}

function addMovement(reference: string, description: string, change: Quantities): void {
  state.movements.unshift({
    at: now(),
    reference,
    description,
    change,
    balance: storeStock(),
  });
}

function totalOf(lines: readonly Lot[]): Quantities {
  const total = qty(0, 0);
  for (const line of lines) total[line.product] += line.quantity;
  return total;
}

function negate(quantities: Quantities): Quantities {
  return { male: -quantities.male, female: -quantities.female };
}

function confirmOrder(target: Order, body: Body, verb: string): Reply {
  const approved = target.status === 'queued' ? readQuantities(body.approved) : target.approved;
  if (!approved) return fail(422, 'Approved quantities must be whole numbers of pieces.');
  if (approved.male + approved.female === 0) {
    return fail(422, 'Approve at least one piece, or put the order on hold.');
  }
  for (const product of PRODUCTS) {
    if (approved[product] > target.requested[product]) {
      return fail(422, 'You cannot approve more than the hotspot requested.', {
        [product]: 'More than requested',
      });
    }
  }
  const lines = allocate(approved, body.lines);
  if (typeof lines === 'string') return fail(409, lines);

  target.approved = approved;
  target.allocation = lines;
  target.status = 'confirmed';
  target.confirmed_at = now();
  target.hold_reason = null;
  addMovement(target.id, `Allocated to ${target.hotspot.name}`, negate(totalOf(lines)));
  record(
    DCFP,
    'dcfp',
    'DCFP',
    `${verb} ${describe(approved)} — ${target.hotspot.contact_name} notified`,
    target.id,
  );
  return ok(target);
}

function handleOrders(
  method: string,
  id: string | undefined,
  action: string | undefined,
  body: Body,
): Reply {
  if (!id) return method === 'GET' ? ok(state.orders) : fail(405, 'Method not allowed');
  const target = state.orders.find((candidate) => candidate.id === id);
  if (!target) return fail(404, `Order ${id} was not found.`);
  if (!action) return method === 'GET' ? ok(target) : fail(405, 'Method not allowed');
  if (method !== 'POST') return fail(405, 'Method not allowed');

  switch (action) {
    case 'confirm':
      if (target.status !== 'queued') return fail(409, `${id} is no longer waiting for review.`);
      return confirmOrder(target, body, 'Confirmed');
    case 'release':
      if (target.status !== 'on_hold') return fail(409, `${id} is not on hold.`);
      return confirmOrder(target, body, 'Released from hold and confirmed');
    case 'hold': {
      if (target.status !== 'queued') return fail(409, `${id} is no longer waiting for review.`);
      const approved = readQuantities(body.approved);
      if (approved) target.approved = approved;
      const reason =
        typeof body.reason === 'string' && body.reason.trim()
          ? body.reason.trim()
          : 'District stock not available';
      target.status = 'on_hold';
      target.hold_reason = reason;
      record(DCFP, 'dcfp', 'DCFP', `Put on hold — ${reason.toLowerCase()}`, target.id);
      return ok(target);
    }
    case 'dispatch': {
      if (target.status !== 'confirmed') return fail(409, `${id} is not ready to dispatch.`);
      const rider = state.riders.find((candidate) => candidate.id === body.rider_id);
      if (!rider) return fail(422, 'Choose a rider.', { rider_id: 'Choose a rider' });
      if (rider.status !== 'available') return fail(409, `${rider.name} is not available.`);
      state.seq.note += 1;
      const noteNumber = `DN-2026-${String(state.seq.note).padStart(4, '0')}`;
      rider.status = 'on_delivery';
      target.status = 'dispatched';
      target.delivery = {
        note_number: noteNumber,
        rider: { id: rider.id, name: rider.name, phone: rider.phone, plate: rider.plate },
        assigned_at: now(),
        collected_at: null,
        delivered_at: null,
      };
      record(
        DCFP,
        'dcfp',
        'DCFP',
        `Handed over to rider ${rider.name} with ${noteNumber}`,
        target.id,
      );
      return ok(target);
    }
    default:
      return fail(404, 'Not found');
  }
}

const CONDITIONS = new Set(['Intact', 'Damaged', 'Batch or expiry differs']);

function receiveRequest(target: WarehouseRequest, body: Body): Reply {
  const { dispatch } = target;
  if (target.status !== 'dispatched' || !dispatch) {
    return fail(409, `${target.id} has not been dispatched yet.`);
  }
  if (!Array.isArray(body.lines) || body.lines.length !== dispatch.lines.length) {
    return fail(422, 'Give a count for every batch on the waybill.');
  }
  const lines: ReceiptLine[] = [];
  for (const [index, line] of dispatch.lines.entries()) {
    const input: unknown = body.lines[index];
    if (!isRecord(input)) return fail(422, 'Give a count for every batch on the waybill.');
    const counted = Number(input.counted);
    const damaged = Number(input.damaged ?? 0);
    const condition = typeof input.condition === 'string' ? input.condition : 'Intact';
    if (!Number.isInteger(counted) || counted < 0 || !Number.isInteger(damaged) || damaged < 0) {
      return fail(422, `Counts for batch ${line.batch} must be whole numbers.`);
    }
    if (damaged > counted) return fail(422, `More damaged than counted for batch ${line.batch}.`);
    if (!CONDITIONS.has(condition)) return fail(422, `Unknown condition for batch ${line.batch}.`);
    lines.push({
      ...line,
      on_waybill: line.quantity,
      counted,
      damaged,
      condition,
      accepted: counted - damaged,
    });
  }
  const differs = lines.some(
    (line) => line.counted !== line.on_waybill || line.damaged > 0 || line.condition !== 'Intact',
  );
  let discrepancy: { type: string; note: string } | null = null;
  if (differs) {
    const input = isRecord(body.discrepancy) ? body.discrepancy : {};
    const note = typeof input.note === 'string' ? input.note.trim() : '';
    const type = typeof input.type === 'string' ? input.type : '';
    if (!type || note.length < 3) {
      return fail(422, 'Describe the discrepancy before confirming receipt.', {
        note: 'Say what happened',
      });
    }
    discrepancy = { type, note };
  }

  for (const line of lines) {
    if (line.accepted <= 0) continue;
    const existing = state.store.lots.find(
      (entry) => entry.product === line.product && entry.batch === line.batch,
    );
    if (existing) existing.quantity += line.accepted;
    else
      state.store.lots.push({
        product: line.product,
        batch: line.batch,
        manufactured_on: line.manufactured_on,
        expires_on: line.expires_on,
        quantity: line.accepted,
      });
  }
  const accepted = qty(0, 0);
  for (const line of lines) accepted[line.product] += line.accepted;
  state.seq.grn += 1;
  const grn = `GRN-WAK-2026-${String(state.seq.grn).padStart(3, '0')}`;
  addMovement(target.id, `Received from ${target.warehouse}`, accepted);
  target.status = 'received';
  target.receipt = {
    received_at: now(),
    received_by: DCFP,
    grn,
    accepted,
    store_after: storeStock(),
    lines,
    discrepancy,
  };
  record(
    DCFP,
    'dcfp',
    'DCFP',
    discrepancy
      ? `Received with a discrepancy (${discrepancy.type.toLowerCase()}) — ${grn} issued`
      : `Received and verified — ${grn} issued`,
    target.id,
  );
  return ok(target);
}

function createRequest(body: Body): Reply {
  const warehouse = body.warehouse;
  if (warehouse !== 'NMS' && warehouse !== 'JMS') {
    return fail(422, 'Choose NMS or JMS.', { warehouse: 'Choose a warehouse' });
  }
  const items = readQuantities(body.items);
  if (!items || items.male + items.female === 0) {
    return fail(422, 'Request at least one piece.', { items: 'Request at least one piece' });
  }
  const linked = Array.isArray(body.linked_orders)
    ? body.linked_orders.filter((value): value is string => typeof value === 'string')
    : [];
  for (const orderId of linked) {
    const held = state.orders.find((candidate) => candidate.id === orderId);
    if (held?.status !== 'on_hold') return fail(409, `${orderId} is not on hold.`);
    if (held.warehouse_request_id) {
      return fail(409, `${orderId} is already waiting on ${held.warehouse_request_id}.`);
    }
  }
  state.seq.request += 1;
  const id = `WR-2026-${String(state.seq.request).padStart(4, '0')}`;
  const request: WarehouseRequest = {
    id,
    warehouse,
    district: state.store.district,
    requested_by: DCFP,
    items,
    linked_orders: linked,
    note: typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null,
    status: 'sent',
    created_at: now(),
    hold_reason: null,
    dispatch: null,
    receipt: null,
  };
  state.requests.unshift(request);
  for (const orderId of linked) {
    const held = state.orders.find((candidate) => candidate.id === orderId);
    if (held) held.warehouse_request_id = id;
  }
  record(DCFP, 'dcfp', 'DCFP', `Requested ${describe(items)} from ${warehouse}`, id);
  return ok(request);
}

function handleRequests(
  method: string,
  id: string | undefined,
  action: string | undefined,
  body: Body,
): Reply {
  if (!id) {
    if (method === 'GET') return ok(state.requests);
    if (method === 'POST') return createRequest(body);
    return fail(405, 'Method not allowed');
  }
  const target = state.requests.find((candidate) => candidate.id === id);
  if (!target) return fail(404, `Request ${id} was not found.`);
  if (!action) return method === 'GET' ? ok(target) : fail(405, 'Method not allowed');
  if (method === 'POST' && action === 'receive') return receiveRequest(target, body);
  return fail(404, 'Not found');
}

/** The resources this module answers for. */
const RESOURCES = new Set([
  'hotspot-orders',
  'warehouse-requests',
  'district-store',
  'riders',
  'activity',
]);

/**
 * Answers a request for one of the fulfilment resources, or returns null when
 * the path is not one of them. `parts` is the path after `/api/v1`, split on `/`.
 */
export function handleFulfilment(
  method: string,
  parts: readonly string[],
  body: Body,
): Reply | null {
  const [resource = '', id, action] = parts;
  if (!RESOURCES.has(resource)) return null;
  switch (resource) {
    case 'hotspot-orders':
      return handleOrders(method, id, action, body);
    case 'warehouse-requests':
      return handleRequests(method, id, action, body);
    case 'district-store':
      if (method !== 'GET') return fail(405, 'Method not allowed');
      return ok({
        name: state.store.name,
        district: state.store.district,
        stock: storeStock(),
        min_levels: state.store.min_levels,
        batches: state.store.lots,
        movements: state.movements,
      });
    case 'riders':
      return method === 'GET' ? ok(state.riders) : fail(405, 'Method not allowed');
    default:
      // Newest first, as a feed is read.
      return method === 'GET'
        ? ok([...state.activity].sort((a, b) => b.at.localeCompare(a.at)))
        : fail(405, 'Method not allowed');
  }
}

/*
 * Shared with the warehouse mock (`warehouse.mts`): the district's warehouse
 * requests are the same records NMS and JMS act on, so a request the
 * warehouse dispatches can be received here. Read live, after any reseed.
 */
export type { Activity, Lot, Quantities, WarehouseRequest };

/** The district's warehouse requests, live: the warehouse mock changes them in place. */
export function fulfilmentRequests(): WarehouseRequest[] {
  return state.requests;
}

/** The district's activity feed, for the warehouse's history of these requests. */
export function fulfilmentActivity(): readonly Activity[] {
  return state.activity;
}

/** Records something a warehouse user did to one of the district's requests. */
export function recordWarehouseActivity(
  actor: string,
  warehouse: string,
  text: string,
  reference: string,
): void {
  record(actor, 'warehouse', warehouse, text, reference);
}

/*
 * Read by the national mock (`moh.mts`): MOH sees this district's orders and
 * store alongside the other districts'. Read live, after any reseed.
 */
export type { Order };

/** The district's hotspot orders, live. */
export function fulfilmentOrders(): readonly Order[] {
  return state.orders;
}

/** The district store's stock and minimum levels, as they stand now. */
export function fulfilmentStore(): {
  name: string;
  district: string;
  stock: Quantities;
  min_levels: Quantities;
} {
  return {
    name: state.store.name,
    district: state.store.district,
    stock: storeStock(),
    min_levels: state.store.min_levels,
  };
}
