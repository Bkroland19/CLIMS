/**
 * The national (MOH) resources for the mock API: hotspot orders and
 * warehouse requests across every district, each order's audit trail,
 * district stores, the national headline figures and the activity feed.
 *
 * None of these exist in the Go API yet. The paths and shapes here are the
 * contract the web client is written against (see `src/features/moh/api.ts`
 * and `design/IMPLEMENTATION_PLAN.md`, Phase 6). Replies use the Go API's
 * `{ success, data }` envelope and its `{ message }` error body.
 *
 * Wakiso is the live district from `fulfilment.mts`: what the DCFP does there
 * shows up here. The other districts are fixed sample records, so the
 * national view is not just one district.
 */
import {
  fulfilmentActivity,
  fulfilmentOrders,
  fulfilmentRequests,
  fulfilmentStore,
  type Activity,
  type Order,
  type Quantities,
  type WarehouseRequest,
} from './fulfilment.mts';

interface Reply {
  status: number;
  body: unknown;
}

type Body = Record<string, unknown>;
type OrderStatus = Order['status'];

interface DistrictStore {
  district: string;
  store: string;
  stock: Quantities;
  min_levels: Quantities;
}

interface Sample {
  stores: DistrictStore[];
  orders: Order[];
  requests: WarehouseRequest[];
  activity: Activity[];
  warehouseStock: { warehouse: 'NMS' | 'JMS'; stock: Quantities }[];
}

const MINUTE = 60_000;
const ORDER_STATUSES: readonly OrderStatus[] = [
  'queued',
  'on_hold',
  'confirmed',
  'dispatched',
  'in_transit',
  'delivered',
  'received',
];

/** A timestamp `minutes` before the server started, so "Today" stays today. */
const ago = (minutes: number): string => new Date(Date.now() - minutes * MINUTE).toISOString();
const qty = (male: number, female: number): Quantities => ({ male, female });
const nothing = (): Quantities => qty(0, 0);

function hotspot(
  id: string,
  name: string,
  district: string,
  subcounty: string,
  contact: [string, string],
): Order['hotspot'] {
  return {
    id,
    name,
    kind: 'Permanent',
    village: subcounty,
    subcounty,
    district,
    contact_name: contact[0],
    contact_phone: contact[1],
    dispenser: 'Working',
    vhts: [],
  };
}

function order(
  id: string,
  spot: Order['hotspot'],
  requested: Quantities,
  status: OrderStatus,
  minutesAgo: number,
  extra: Partial<Order> = {},
): Order {
  return {
    id,
    hotspot: spot,
    requested,
    approved: { ...requested },
    stock_at_hotspot: null,
    reason: 'Out of stock',
    note: null,
    status,
    requested_by: { name: spot.contact_name, role: 'Hotspot manager' },
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

function request(
  id: string,
  warehouse: 'NMS' | 'JMS',
  district: string,
  by: string,
  items: Quantities,
  status: WarehouseRequest['status'],
  minutesAgo: number,
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
    created_at: ago(minutesAgo),
    hold_reason: null,
    dispatch: null,
    receipt: null,
    ...extra,
  };
}

const describe = (quantities: Quantities): string =>
  [
    quantities.male > 0 ? `Male ${quantities.male.toLocaleString('en-US')}` : '',
    quantities.female > 0 ? `Female ${quantities.female.toLocaleString('en-US')}` : '',
  ]
    .filter(Boolean)
    .join(' · ') || 'nothing';

const rider = (id: string, name: string, phone: string, plate: string) => ({
  id,
  name,
  phone,
  plate,
});

function demoSample(): Sample {
  const owino = hotspot('HS-0412', 'Owino Market', 'Kampala', 'Kampala Central', [
    'Rose Nalwanga',
    '+256 772 310 455',
  ]);
  const kisenyi = hotspot('HS-0415', 'Kisenyi Bus Park', 'Kampala', 'Kampala Central', [
    'Hassan Kigozi',
    '+256 701 228 904',
  ]);
  const kabalagala = hotspot('HS-0420', 'Kabalagala Strip', 'Kampala', 'Makindye', [
    'Juliet Auma',
    '+256 753 117 620',
  ]);
  const seeta = hotspot('HS-0118', 'Seeta Trading Centre', 'Mukono', 'Goma', [
    'Fred Ssekitoleko',
    '+256 774 905 312',
  ]);
  const mukonoPark = hotspot('HS-0121', 'Mukono Taxi Park', 'Mukono', 'Mukono Central', [
    'Lydia Nabirye',
    '+256 782 640 118',
  ]);
  const guluMarket = hotspot('HS-0207', 'Gulu Main Market', 'Gulu', 'Laroo-Pece', [
    'Atim Grace',
    '+256 772 111 222',
  ]);
  const lacor = hotspot('HS-0211', 'Lacor Junction Lodges', 'Gulu', 'Bardege-Layibi', [
    'Okot Denis',
    '+256 789 404 771',
  ]);
  const mbararaPark = hotspot('HS-0093', 'Mbarara Taxi Park', 'Mbarara', 'Kamukuzi', [
    'Mugisha Peter',
    '+256 701 333 444',
  ]);

  const ivan = rider('R-KLA-1', 'Ivan Lubega', '+256 704 551 209', 'UFK 220L');
  const okello = rider('R-GUL-1', 'Okello Charles', '+256 777 302 118', 'UEX 913B');
  const tumwine = rider('R-MBR-1', 'Tumwine Allan', '+256 759 880 431', 'UGB 104S');

  const orders: Order[] = [
    order('ORD-KLA-0412', owino, qty(1000, 50), 'queued', 50),
    order('ORD-KLA-0409', kisenyi, qty(600, 30), 'in_transit', 400, {
      reason: 'Running low',
      confirmed_at: ago(300),
      delivery: {
        note_number: 'DN-KLA-0219',
        rider: ivan,
        assigned_at: ago(220),
        collected_at: ago(200),
        delivered_at: null,
      },
    }),
    order('ORD-KLA-0401', kabalagala, qty(500, 40), 'received', 4000, {
      confirmed_at: ago(3800),
      delivery: {
        note_number: 'DN-KLA-0211',
        rider: ivan,
        assigned_at: ago(3700),
        collected_at: ago(3650),
        delivered_at: ago(3500),
      },
      received_at: ago(3450),
    }),
    order('ORD-MKN-0118', seeta, qty(800, 40), 'on_hold', 1300, {
      hold_reason: 'District stock not available',
      warehouse_request_id: 'WR-MKN-2026-0011',
    }),
    order('ORD-MKN-0115', mukonoPark, qty(300, 20), 'confirmed', 700, {
      reason: 'Running low',
      confirmed_at: ago(640),
    }),
    order('ORD-GUL-0207', guluMarket, qty(400, 60), 'on_hold', 2000, {
      hold_reason: 'Female condoms out of stock in the district',
      warehouse_request_id: 'WR-GUL-2026-0019',
    }),
    order('ORD-GUL-0204', lacor, qty(700, 0), 'delivered', 900, {
      confirmed_at: ago(820),
      delivery: {
        note_number: 'DN-GUL-0102',
        rider: okello,
        assigned_at: ago(780),
        collected_at: ago(760),
        delivered_at: ago(600),
      },
    }),
    order('ORD-MBR-0093', mbararaPark, qty(1200, 80), 'received', 9000, {
      confirmed_at: ago(4300),
      warehouse_request_id: 'WR-MBR-2026-0008',
      delivery: {
        note_number: 'DN-MBR-0077',
        rider: tumwine,
        assigned_at: ago(4200),
        collected_at: ago(4150),
        delivered_at: ago(4000),
      },
      received_at: ago(3950),
    }),
  ];

  const requests: WarehouseRequest[] = [
    request(
      'WR-MKN-2026-0011',
      'NMS',
      'Mukono',
      'Brenda Achieng',
      qty(5000, 300),
      'under_review',
      1250,
      {
        linked_orders: ['ORD-MKN-0118'],
      },
    ),
    request('WR-GUL-2026-0019', 'JMS', 'Gulu', 'Opio Samuel', qty(3000, 400), 'dispatched', 1900, {
      linked_orders: ['ORD-GUL-0207'],
      dispatch: {
        dispatched_at: ago(300),
        waybill: 'WB-JMS-26-0451',
        vehicle: 'UBH 310K',
        driver: 'Moses Ouma',
        items: qty(3000, 400),
        lines: [],
      },
    }),
    request(
      'WR-MBR-2026-0008',
      'NMS',
      'Mbarara',
      'Kansiime Doreen',
      qty(4000, 200),
      'received',
      8900,
      {
        linked_orders: ['ORD-MBR-0093'],
        dispatch: {
          dispatched_at: ago(6000),
          waybill: 'WB-NMS-26-1102',
          vehicle: 'UBF 118Q',
          driver: 'Robert Ssali',
          items: qty(4000, 200),
          lines: [],
        },
        receipt: {
          received_at: ago(4400),
          received_by: 'Kansiime Doreen',
          grn: 'GRN-MBR-2026-006',
          accepted: qty(3880, 200),
          store_after: qty(11600, 540),
          lines: [],
          discrepancy: {
            type: 'Damaged',
            note: 'One carton of 120 male condoms crushed in transit; set aside for return to NMS.',
          },
        },
      },
    ),
  ];

  let seq = 0;
  const event = (
    minutesAgo: number,
    actor: string,
    role: Activity['role'],
    roleLabel: string,
    text: string,
    reference: string,
  ): Activity => {
    seq += 1;
    return {
      id: `NAT-${String(seq).padStart(3, '0')}`,
      at: ago(minutesAgo),
      actor,
      role,
      role_label: roleLabel,
      text,
      reference,
    };
  };
  const HM = 'hotspot_manager';
  const notified = (target: Order, minutesAgo: number) =>
    event(
      minutesAgo,
      target.requested_by.name,
      HM,
      'Hotspot manager',
      `Notified a stockout at ${target.hotspot.name} — ${describe(target.requested)}`,
      target.id,
    );
  const byId = (id: string): Order => {
    const found = orders.find((candidate) => candidate.id === id);
    if (!found) throw new Error(`Sample order ${id} is missing.`);
    return found;
  };

  const activity: Activity[] = [
    notified(byId('ORD-KLA-0412'), 50),
    notified(byId('ORD-KLA-0409'), 400),
    event(300, 'Eria Mutebi', 'dcfp', 'DCFP', 'Confirmed Male 600 · Female 30', 'ORD-KLA-0409'),
    event(
      220,
      'Eria Mutebi',
      'dcfp',
      'DCFP',
      'Handed over to rider Ivan Lubega with DN-KLA-0219',
      'ORD-KLA-0409',
    ),
    event(
      200,
      'Ivan Lubega',
      'rider',
      'Rider',
      'Collected from the district store',
      'ORD-KLA-0409',
    ),
    notified(byId('ORD-KLA-0401'), 4000),
    event(3800, 'Eria Mutebi', 'dcfp', 'DCFP', 'Confirmed Male 500 · Female 40', 'ORD-KLA-0401'),
    event(
      3700,
      'Eria Mutebi',
      'dcfp',
      'DCFP',
      'Handed over to rider Ivan Lubega with DN-KLA-0211',
      'ORD-KLA-0401',
    ),
    event(
      3500,
      'Ivan Lubega',
      'rider',
      'Rider',
      'Delivered — signed delivery note photographed',
      'ORD-KLA-0401',
    ),
    event(
      3450,
      'Juliet Auma',
      HM,
      'Hotspot manager',
      'Confirmed receipt of Male 500 · Female 40',
      'ORD-KLA-0401',
    ),
    notified(byId('ORD-MKN-0118'), 1300),
    event(
      1270,
      'Brenda Achieng',
      'dcfp',
      'DCFP',
      'Put on hold — district stock not available',
      'ORD-MKN-0118',
    ),
    event(
      1250,
      'Brenda Achieng',
      'dcfp',
      'DCFP',
      'Requested Male 5,000 · Female 300 from NMS',
      'WR-MKN-2026-0011',
    ),
    event(
      400,
      'Sarah Kemigisa',
      'warehouse',
      'NMS',
      'Opened the request for review',
      'WR-MKN-2026-0011',
    ),
    notified(byId('ORD-MKN-0115'), 700),
    event(640, 'Brenda Achieng', 'dcfp', 'DCFP', 'Confirmed Male 300 · Female 20', 'ORD-MKN-0115'),
    notified(byId('ORD-GUL-0207'), 2000),
    event(
      1950,
      'Opio Samuel',
      'dcfp',
      'DCFP',
      'Put on hold — female condoms out of stock',
      'ORD-GUL-0207',
    ),
    event(
      1900,
      'Opio Samuel',
      'dcfp',
      'DCFP',
      'Requested Male 3,000 · Female 400 from JMS',
      'WR-GUL-2026-0019',
    ),
    event(
      300,
      'Paul Ssekandi',
      'warehouse',
      'JMS',
      'Dispatched on waybill WB-JMS-26-0451',
      'WR-GUL-2026-0019',
    ),
    notified(byId('ORD-GUL-0204'), 900),
    event(820, 'Opio Samuel', 'dcfp', 'DCFP', 'Confirmed Male 700', 'ORD-GUL-0204'),
    event(
      780,
      'Opio Samuel',
      'dcfp',
      'DCFP',
      'Handed over to rider Okello Charles with DN-GUL-0102',
      'ORD-GUL-0204',
    ),
    event(
      600,
      'Okello Charles',
      'rider',
      'Rider',
      'Delivered — signed delivery note photographed',
      'ORD-GUL-0204',
    ),
    notified(byId('ORD-MBR-0093'), 9000),
    event(
      8950,
      'Kansiime Doreen',
      'dcfp',
      'DCFP',
      'Put on hold — district stock not available',
      'ORD-MBR-0093',
    ),
    event(
      8900,
      'Kansiime Doreen',
      'dcfp',
      'DCFP',
      'Requested Male 4,000 · Female 200 from NMS',
      'WR-MBR-2026-0008',
    ),
    event(
      6000,
      'Sarah Kemigisa',
      'warehouse',
      'NMS',
      'Dispatched on waybill WB-NMS-26-1102',
      'WR-MBR-2026-0008',
    ),
    event(
      4400,
      'Kansiime Doreen',
      'dcfp',
      'DCFP',
      'Received with a discrepancy (damaged) — GRN-MBR-2026-006 issued',
      'WR-MBR-2026-0008',
    ),
    event(
      4300,
      'Kansiime Doreen',
      'dcfp',
      'DCFP',
      'Released from hold and confirmed Male 1,200 · Female 80',
      'ORD-MBR-0093',
    ),
    event(
      4200,
      'Kansiime Doreen',
      'dcfp',
      'DCFP',
      'Handed over to rider Tumwine Allan with DN-MBR-0077',
      'ORD-MBR-0093',
    ),
    event(
      4000,
      'Tumwine Allan',
      'rider',
      'Rider',
      'Delivered — signed delivery note photographed',
      'ORD-MBR-0093',
    ),
    event(
      3950,
      'Mugisha Peter',
      HM,
      'Hotspot manager',
      'Confirmed receipt of Male 1,200 · Female 80',
      'ORD-MBR-0093',
    ),
  ];

  return {
    stores: [
      {
        district: 'Kampala',
        store: 'Kampala district store',
        stock: qty(18400, 1120),
        min_levels: qty(5000, 300),
      },
      {
        district: 'Mukono',
        store: 'Mukono district store',
        stock: qty(3900, 210),
        min_levels: qty(5000, 300),
      },
      {
        district: 'Gulu',
        store: 'Gulu district store',
        stock: qty(7250, 0),
        min_levels: qty(4000, 200),
      },
      {
        district: 'Mbarara',
        store: 'Mbarara district store',
        stock: qty(11600, 540),
        min_levels: qty(5000, 300),
      },
    ],
    orders,
    requests,
    activity,
    warehouseStock: [
      { warehouse: 'NMS', stock: qty(512_000, 38_400) },
      { warehouse: 'JMS', stock: qty(162_000, 12_600) },
    ],
  };
}

/** The demo sample plus a district that breaks layouts: a long name, nothing in stock. */
function worstSample(): Sample {
  const sample = demoSample();
  const district = 'Bundibugyo–Ntoroko border district with an unusually long name';
  const spot = hotspot(
    'HS-9001',
    'Lodge-and-bar-on-the-border-crossing-without-any-spaces-in-its-name',
    district,
    'Rwenzori sub-region, far western border crossing',
    ['Kyomuhendo-Tibamwenda Rwabugahya', '+256 700 000 001'],
  );
  sample.stores.push({
    district,
    store: `${district} store`,
    stock: nothing(),
    min_levels: nothing(),
  });
  sample.orders.push(order('ORD-XXL-9999', spot, qty(9_999_999, 0), 'queued', 1));
  return sample;
}

function emptySample(): Sample {
  return {
    stores: [],
    orders: [],
    requests: [],
    activity: [],
    warehouseStock: [
      { warehouse: 'NMS', stock: nothing() },
      { warehouse: 'JMS', stock: nothing() },
    ],
  };
}

const SAMPLES = { demo: demoSample, worst: worstSample, empty: emptySample };

let sample: Sample = demoSample();

/** Seeds the national sample for a dataset name. Unknown names fall back to the demo. */
export function seedMoh(dataset: string): void {
  sample = (
    Object.hasOwn(SAMPLES, dataset) ? SAMPLES[dataset as keyof typeof SAMPLES] : demoSample
  )();
}

const ok = (data: unknown): Reply => ({ status: 200, body: { success: true, data } });
const fail = (status: number, message: string): Reply => ({
  status,
  body: { success: false, message },
});

const newestFirst = <Row extends { created_at: string }>(rows: Row[]): Row[] =>
  rows.sort((a, b) => b.created_at.localeCompare(a.created_at));

/* Wakiso's live records first, then the sample districts'. */
const allOrders = (): Order[] => [...fulfilmentOrders(), ...sample.orders];
const allRequests = (): WarehouseRequest[] => [...fulfilmentRequests(), ...sample.requests];
const allActivity = (): Activity[] => [...fulfilmentActivity(), ...sample.activity];

function allStores(): (DistrictStore & { open_orders: number })[] {
  const wakiso = fulfilmentStore();
  const stores: DistrictStore[] = [
    {
      district: wakiso.district,
      store: wakiso.name,
      stock: wakiso.stock,
      min_levels: wakiso.min_levels,
    },
    ...sample.stores,
  ];
  const open = allOrders().filter((candidate) => candidate.status !== 'received');
  return stores.map((store) => ({
    ...store,
    open_orders: open.filter((candidate) => candidate.hotspot.district === store.district).length,
  }));
}

const inDistrict = (district: string | null) => (name: string | null) =>
  district === null || name?.toLowerCase() === district.toLowerCase();

function orderDetail(id: string): Reply {
  const target = allOrders().find((candidate) => candidate.id === id);
  if (!target) return fail(404, `Order ${id} was not found.`);
  const linked = target.warehouse_request_id
    ? (allRequests().find((candidate) => candidate.id === target.warehouse_request_id) ?? null)
    : null;
  const references = linked ? [target.id, linked.id] : [target.id];
  const trail = allActivity()
    .filter((event) => event.reference !== null && references.includes(event.reference))
    .sort((a, b) => a.at.localeCompare(b.at));
  const hold = trail.find(
    (event) => event.reference === target.id && /put on hold/i.test(event.text),
  );
  // An order held before the feed recorded holds still counts from when it arrived.
  const heldAt = hold ? hold.at : target.status === 'on_hold' ? target.created_at : null;
  return ok({ order: target, warehouse_request: linked, held_at: heldAt, trail });
}

function summary(keeps: (name: string | null) => boolean): Reply {
  const orders = allOrders().filter((order) => keeps(order.hotspot.district));
  const byStatus = Object.fromEntries(ORDER_STATUSES.map((status) => [status, 0])) as Record<
    OrderStatus,
    number
  >;
  for (const entry of orders) byStatus[entry.status] += 1;
  const weekAgo = Date.now() - 7 * 24 * 60 * MINUTE;
  const received = orders.filter((entry) => entry.received_at !== null);
  const leadMinutes = received.map(
    (entry) =>
      (new Date(entry.received_at ?? entry.created_at).getTime() -
        new Date(entry.created_at).getTime()) /
      MINUTE,
  );
  return ok({
    warehouse_stock: sample.warehouseStock,
    orders_by_status: byStatus,
    stockouts_last_7_days: orders.filter(
      (entry) => entry.reason === 'Out of stock' && new Date(entry.created_at).getTime() > weekAgo,
    ).length,
    average_lead_minutes:
      leadMinutes.length > 0
        ? Math.round(
            leadMinutes.reduce((total, minutes) => total + minutes, 0) / leadMinutes.length,
          )
        : null,
  });
}

/**
 * Answers a request for one of the national resources, or returns null when
 * the path is not one of them. `parts` is the path after `/api/v1`, split on
 * `/`; `query` is the query string, for the `district` filter.
 */
export function handleMoh(
  method: string,
  parts: readonly string[],
  _body: Body,
  query: URLSearchParams,
): Reply | null {
  const [resource = '', collection = '', id] = parts;
  if (resource !== 'national') return null;
  if (method !== 'GET') return fail(405, 'Method not allowed');
  const district = query.get('district');
  const keeps = inDistrict(district === '' ? null : district);

  switch (collection) {
    case 'hotspot-orders':
      if (id) return orderDetail(id);
      return ok(newestFirst(allOrders().filter((entry) => keeps(entry.hotspot.district))));
    case 'warehouse-requests':
      return ok(newestFirst(allRequests().filter((entry) => keeps(entry.district))));
    case 'summary':
      return summary(keeps);
    case 'district-stores':
      return ok(allStores());
    case 'activity': {
      const references = new Set([
        ...allOrders()
          .filter((order) => keeps(order.hotspot.district))
          .map((order) => order.id),
        ...allRequests()
          .filter((request) => keeps(request.district))
          .map((request) => request.id),
      ]);
      return ok(
        allActivity()
          .filter(
            (event) =>
              event.role !== 'system' &&
              (!district || (event.reference !== null && references.has(event.reference))),
          )
          .sort((a, b) => b.at.localeCompare(a.at))
          .slice(0, 20),
      );
    }
    default:
      return fail(404, 'Not found');
  }
}
