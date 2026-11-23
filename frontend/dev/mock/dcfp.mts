/**
 * The DCFP's flows for the mock API, in the Go API's shapes (docs/modules/orders.md):
 *
 * - `GET/POST /orders/stockouts`: hotspot stockout reports. A report notifies the district's
 *   DCFPs; it is not an order. `GET /orders/stockouts/:id` adds its deliveries and history, and
 *   `POST /orders/stockouts/:id/deliveries` records stock sent from the district store (no stock
 *   is checked: the mock keeps no inventory). Acknowledgements happen in the field app.
 * - `POST /orders/warehouse-requests`: the DCFP orders a condom category and quantity from NMS or JMS;
 *   the warehouse chooses the product.
 * - `GET /orders`, `/orders/:id`, `/orders/:id/events`, and `POST /orders/:id/actions/receive`.
 * - `/notifications`: the signed-in user's central inbox.
 *
 * The mock user is a DCFP at the Wakiso district store. Warehouse steps (review, check-stock,
 * dispatch) are not simulated: seeded orders start at each status instead.
 */
import { mockProductId, mockUnitId } from './admin.mts';
import { MOCK_STORES, mockDistrictStoreId } from './hotspots.mts';

interface Reply {
  status: number;
  body: unknown;
}

type Body = Record<string, unknown>;

type Status = 'queued' | 'reviewed' | 'on_hold' | 'confirmed' | 'dispatched' | 'received';

interface Order {
  id: string;
  condom_id: string | null;
  condom_category: 'male' | 'female';
  quantity_needed: number;
  quantity_issued: number | null;
  quantity_received: number | null;
  order_status: Status;
  order_date: string;
  ordered_by_id: string;
  handled_by_id: string | null;
  ordered_for_store_id: string;
  ordered_from_store_id: string;
  unit_of_measure_id: string;
  comment: string | null;
  discrepancy_note: string | null;
  hot_spot_id: null;
  parent_order_id: null;
  rider_id: null;
  delivery_note: null;
  created_at: string;
  updated_at: string;
}

interface Event {
  id: string;
  order_id: string;
  actor_id: string;
  action: string;
  status: Status;
  created_at: string;
}

interface Report {
  id: string;
  hot_spot_id: string;
  hot_spot: {
    name: string;
    village: string | null;
    subcounty: string | null;
    district: string | null;
    contact_name: string | null;
    contact_phone: string | null;
  };
  condom_id: string | null;
  selection: 'male' | 'female' | 'both';
  product: string;
  district_store_id: string;
  reported_by_id: string;
  reported_by: string;
  comment: string | null;
  created_at: string;
  repeat_count: number;
  last_reported_at: string;
  status: 'awaiting_supply' | 'awaiting_acknowledgement' | 'partly_received' | 'fulfilled';
  fulfilled_at: string | null;
}

interface Delivery {
  id: string;
  delivered_by_id: string;
  note: string | null;
  created_at: string;
  lines: {
    id: string;
    category: 'male' | 'female';
    condom_id: string;
    product: string;
    unit_of_measure_id: string;
    quantity: number;
    pieces: number;
    acknowledged_pieces: number | null;
    acknowledged_at: string | null;
  }[];
}

interface ReportEvent {
  id: string;
  actor_id: string | null;
  action: 'raised' | 'repeated' | 'selection_changed' | 'delivered' | 'acknowledged';
  selection: Report['selection'];
  created_at: string;
}

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  resource_type: string | null;
  resource_id: string | null;
  actor_id: string | null;
  data: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

const id = (prefix: number, n: number) =>
  `00000000-0000-4000-${String(8300 + prefix)}-${String(n).padStart(12, '0')}`;
const hoursAgo = (hours: number) => new Date(Date.now() - hours * 60 * 60_000).toISOString();

const DISTRICT = mockDistrictStoreId('Wakiso') ?? '';
const NMS = MOCK_STORES.find((store) => store.code === 'nms')?.id ?? '';
const JMS = MOCK_STORES.find((store) => store.code === 'jms')?.id ?? '';
const NATIONAL = new Set([NMS, JMS]);
const ME = '00000000-0000-4000-8002-000000000001';
const WAREHOUSE_STAFF = '00000000-0000-4000-8002-000000000009';

/** Products the seed refers to, by the admin mock's numbering, and what the API calls them. */
const PRODUCTS: Record<string, { name: string; unit: string | null }> = {
  [mockProductId(1)]: { name: 'Engabu Free Male', unit: mockUnitId(1) },
  [mockProductId(2)]: { name: 'Engabu Free Male', unit: mockUnitId(2) },
  [mockProductId(3)]: { name: 'Engabu Free Male', unit: mockUnitId(3) },
  [mockProductId(4)]: { name: 'FC2 Free Female', unit: mockUnitId(1) },
  [mockProductId(5)]: { name: 'FC2 Free Female', unit: mockUnitId(2) },
  [mockProductId(7)]: { name: 'Trust Commercial Male', unit: null },
  [mockProductId(99)]: {
    name: 'A brand name long enough Socially marketed Female',
    unit: mockUnitId(3),
  },
};

/** The condom category of a seeded product, read from its name. */
const categoryOf = (product: string | null): 'male' | 'female' =>
  product && PRODUCTS[product]?.name.endsWith('Female') ? 'female' : 'male';

const state = {
  orders: [] as Order[],
  events: [] as Event[],
  reports: [] as Report[],
  /** Each report's deliveries and history, by report id. */
  deliveries: {} as Record<string, Delivery[]>,
  reportEvents: {} as Record<string, ReportEvent[]>,
  notifications: [] as Notification[],
  next: 1,
};

const ok = (data: unknown, status = 200): Reply => ({ status, body: { success: true, data } });
const fail = (status: number, message: string, error?: Record<string, string>): Reply => ({
  status,
  body: error ? { success: false, message, error } : { success: false, message },
});

function order(
  n: number,
  values: Partial<Order> & Pick<Order, 'order_status'>,
  hours: number,
): Order {
  const quantity = values.quantity_needed ?? 500;
  const product = values.condom_id === undefined ? mockProductId(5) : values.condom_id;
  return {
    id: id(1, n),
    condom_id: product,
    condom_category: categoryOf(product),
    quantity_needed: quantity,
    quantity_issued: null,
    quantity_received: null,
    order_date: hoursAgo(hours).slice(0, 10),
    ordered_by_id: ME,
    handled_by_id: null,
    ordered_for_store_id: DISTRICT,
    ordered_from_store_id: NMS,
    unit_of_measure_id: mockUnitId(2),
    comment: null,
    discrepancy_note: null,
    hot_spot_id: null,
    parent_order_id: null,
    rider_id: null,
    delivery_note: null,
    created_at: hoursAgo(hours),
    updated_at: hoursAgo(Math.max(hours - 6, 0)),
    ...values,
  };
}

/** The steps that brought a seeded order to its status. */
function historyOf(o: Order): Event[] {
  const steps: [string, Status, string][] = [['replenishment_requested', 'queued', ME]];
  const reached = ['queued', 'reviewed', 'on_hold', 'confirmed', 'dispatched', 'received'].indexOf(
    o.order_status,
  );
  if (reached >= 1) steps.push(['review', 'reviewed', WAREHOUSE_STAFF]);
  if (o.order_status === 'on_hold') steps.push(['check-stock', 'on_hold', WAREHOUSE_STAFF]);
  if (reached >= 3) steps.push(['check-stock', 'confirmed', WAREHOUSE_STAFF]);
  if (reached >= 4) steps.push(['dispatch', 'dispatched', WAREHOUSE_STAFF]);
  if (reached >= 5) steps.push(['receive', 'received', ME]);
  const start = Date.parse(o.created_at);
  return steps.map(([action, status, actor], index) => ({
    id: `${o.id}-e${index}`,
    order_id: o.id,
    actor_id: actor,
    action,
    status,
    created_at: new Date(start + index * 3 * 60 * 60_000).toISOString(),
  }));
}

function report(n: number, values: Partial<Report>, hours: number): Report {
  return {
    id: id(2, n),
    hot_spot_id: id(3, n),
    hot_spot: {
      name: 'Kisenyi Landing Site',
      village: 'Kisenyi',
      subcounty: 'Katabi Town Council',
      district: 'Wakiso',
      contact_name: 'Peter Okello',
      contact_phone: '0772 123456',
    },
    condom_id: null,
    selection: 'female',
    product: 'female condoms',
    district_store_id: DISTRICT,
    reported_by_id: id(4, n),
    reported_by: 'Grace Nakato',
    comment: null,
    created_at: hoursAgo(hours),
    repeat_count: 0,
    last_reported_at: hoursAgo(hours),
    status: 'awaiting_supply',
    fulfilled_at: null,
    ...values,
  };
}

/** A report with its deliveries and history, as `GET /orders/stockouts/:id` returns it. */
function stockoutDetail(r: Report) {
  return {
    ...r,
    deliveries: state.deliveries[r.id] ?? [],
    events: state.reportEvents[r.id] ?? [
      {
        id: `${r.id}-raised`,
        actor_id: r.reported_by_id,
        action: 'raised',
        selection: r.selection,
        created_at: r.created_at,
      },
    ],
  };
}

/** Records stock sent to a hotspot. Lines must name seeded products of the report's categories. */
function deliver(r: Report, body: Body): Reply {
  if (r.fulfilled_at) return fail(409, 'this notification is already fulfilled');
  const lines = Array.isArray(body.lines) ? (body.lines as Body[]) : [];
  if (lines.length === 0 || lines.length > 20)
    return fail(422, 'a delivery needs between 1 and 20 lines');
  const now = new Date().toISOString();
  const deliveryId = id(9, (state.next += 1));
  const recorded: Delivery['lines'] = [];
  for (const line of lines) {
    const productId = text(line.condom_id);
    const quantity = typeof line.quantity === 'number' ? line.quantity : 0;
    const product = PRODUCTS[productId];
    if (!product) return fail(422, 'unknown product');
    if (!Number.isInteger(quantity) || quantity < 1) {
      return fail(422, 'each line needs a quantity between 1 and 1000000');
    }
    const category = categoryOf(productId);
    if (r.selection !== 'both' && r.selection !== category) {
      return fail(422, "a delivery line's product type is not in the notification's selection");
    }
    recorded.push({
      id: id(10, (state.next += 1)),
      category,
      condom_id: productId,
      product: product.name,
      unit_of_measure_id: product.unit ?? mockUnitId(1),
      quantity,
      // The mock does not know pack sizes; 100 a unit keeps the numbers readable.
      pieces: quantity * 100,
      acknowledged_pieces: null,
      acknowledged_at: null,
    });
  }
  const detail = stockoutDetail(r);
  state.deliveries[r.id] = [
    ...detail.deliveries,
    {
      id: deliveryId,
      delivered_by_id: ME,
      note: text(body.note) || null,
      created_at: now,
      lines: recorded,
    },
  ];
  state.reportEvents[r.id] = [
    ...detail.events,
    {
      id: `${deliveryId}-event`,
      actor_id: ME,
      action: 'delivered',
      selection: r.selection,
      created_at: now,
    },
  ];
  r.status = 'awaiting_acknowledgement';
  return ok(stockoutDetail(r), 201);
}

function stockoutNotification(r: Report): Notification {
  const place = [r.hot_spot.village, r.hot_spot.subcounty, r.hot_spot.district]
    .filter(Boolean)
    .join(', ');
  const contact = [
    r.hot_spot.contact_name,
    r.hot_spot.contact_phone && `(${r.hot_spot.contact_phone})`,
  ]
    .filter(Boolean)
    .join(' ');
  return {
    id: `${r.id}-n`,
    type: 'order.stockout_reported',
    title: `Stockout at ${r.hot_spot.name}`,
    body:
      `${r.hot_spot.name}${place ? `, ${place},` : ''} is out of ${r.product}.` +
      (r.comment ? ` Message: "${r.comment}"` : '') +
      ` Reported by ${r.reported_by}.` +
      (contact ? ` Contact: ${contact}.` : ''),
    resource_type: 'hotspot',
    resource_id: r.hot_spot_id,
    actor_id: r.reported_by_id,
    data: {
      report_id: r.id,
      hotspot: r.hot_spot.name,
      product: r.product,
      message: r.comment ?? '',
    },
    read_at: null,
    created_at: r.created_at,
  };
}

export function seedDcfp(dataset: string): void {
  state.next = 100;
  if (dataset === 'empty') {
    Object.assign(state, {
      orders: [],
      events: [],
      reports: [],
      deliveries: {},
      reportEvents: {},
      notifications: [],
    });
    return;
  }
  state.orders = [
    order(1, { order_status: 'queued', comment: 'Two hotspots in Katabi are out' }, 3),
    order(
      2,
      { order_status: 'on_hold', ordered_from_store_id: JMS, condom_id: mockProductId(2) },
      30,
    ),
    order(
      3,
      { order_status: 'dispatched', quantity_issued: 480, handled_by_id: WAREHOUSE_STAFF },
      52,
    ),
    order(
      4,
      {
        order_status: 'received',
        condom_id: mockProductId(2),
        quantity_needed: 1000,
        quantity_issued: 1000,
        quantity_received: 990,
        discrepancy_note: 'One box damaged in transit',
        handled_by_id: WAREHOUSE_STAFF,
      },
      24 * 9,
    ),
  ];
  state.deliveries = {};
  state.reportEvents = {};
  state.reports = [
    report(1, { comment: 'Dispenser empty since Monday' }, 2),
    report(
      2,
      {
        hot_spot: {
          name: 'Nansana Bus Park',
          village: 'Nansana',
          subcounty: 'Nansana Division',
          district: 'Wakiso',
          contact_name: null,
          contact_phone: '0701 555123',
        },
        condom_id: mockProductId(2),
        product: 'Engabu Free Male',
        reported_by: 'Moses Kato',
        comment: 'Running low. Weekend market',
      },
      20,
    ),
    report(
      3,
      {
        hot_spot: {
          name: 'Kasangati Bar 7',
          village: null,
          subcounty: null,
          district: 'Wakiso',
          contact_name: null,
          contact_phone: null,
        },
        reported_by: 'Agnes Atim',
      },
      24 * 12,
    ),
  ];
  if (dataset === 'worst') {
    state.reports.unshift(
      report(
        99,
        {
          hot_spot: {
            name: 'A hotspot with a name long enough to wrap twice in the table cell',
            village: 'V'.repeat(60),
            subcounty: null,
            district: 'Wakiso',
            contact_name: 'Someone With A Very Long Name Indeed',
            contact_phone: '+256 772 000000 ext. 12345',
          },
          condom_id: mockProductId(99),
          product: PRODUCTS[mockProductId(99)]?.name ?? 'Condoms',
          comment: 'x'.repeat(600),
        },
        1,
      ),
    );
  }
  state.events = state.orders.flatMap(historyOf);
  state.notifications = state.reports.map(stockoutNotification);
  // Older ones have been read.
  for (const n of state.notifications.slice(2)) n.read_at = hoursAgo(1);
}

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

function placeWarehouseOrder(body: Body): Reply {
  const warehouse = text(body.warehouse_store_id);
  const unit = text(body.unit_of_measure_id);
  const category = text(body.condom_category);
  const quantity = body.quantity;
  if (!warehouse || !unit)
    return fail(422, 'provide warehouse_store_id and unit_of_measure_id UUIDs');
  if (category !== 'male' && category !== 'female') {
    const message = 'condom_category must be male or female';
    return fail(422, message, { condom_category: message });
  }
  if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1) {
    const message = 'quantity must be a positive whole number';
    return fail(422, message, { quantity: message });
  }
  if (!NATIONAL.has(warehouse)) {
    const message = 'warehouse_store_id must name a national warehouse (NMS or JMS)';
    return fail(422, message, { warehouse_store_id: message });
  }
  const created = order(
    (state.next += 1),
    {
      order_status: 'queued',
      condom_id: null,
      condom_category: category,
      quantity_needed: quantity,
      ordered_from_store_id: warehouse,
      unit_of_measure_id: unit,
      comment: text(body.comment) || null,
    },
    0,
  );
  created.updated_at = created.created_at;
  state.orders.unshift(created);
  state.events.push(...historyOf(created));
  return ok(created, 201);
}

function receive(o: Order, body: Body): Reply {
  if (o.order_status !== 'dispatched') {
    return fail(409, 'action is unavailable in the current order state');
  }
  const counted = body.quantity_received;
  const note = text(body.discrepancy_note);
  if (typeof counted !== 'number' || !Number.isInteger(counted) || counted < 0) {
    return fail(422, 'action requires valid shipment or receipt details');
  }
  if (counted !== o.quantity_issued && !note) {
    return fail(422, 'action requires valid shipment or receipt details');
  }
  Object.assign(o, {
    order_status: 'received',
    quantity_received: counted,
    discrepancy_note: note || null,
    updated_at: new Date().toISOString(),
  });
  state.events.push({
    id: `${o.id}-e${state.events.length}`,
    order_id: o.id,
    actor_id: ME,
    action: 'receive',
    status: 'received',
    created_at: o.updated_at,
  });
  return ok(o);
}

function reportStockout(body: Body): Reply {
  const hotSpot = text(body.hot_spot_id);
  const selection = text(body.condom_category);
  if (!hotSpot) return fail(422, "provide the hotspot's UUID");
  if (selection !== 'male' && selection !== 'female' && selection !== 'both') {
    return fail(422, 'condom_category must be male, female or both');
  }
  const created = report(
    (state.next += 1),
    {
      hot_spot_id: hotSpot,
      selection,
      product: selection === 'both' ? 'male and female condoms' : `${selection} condoms`,
      reported_by: 'Sarah Nakato',
      reported_by_id: ME,
      comment: text(body.message) || null,
    },
    0,
  );
  state.reports.unshift(created);
  state.notifications.unshift(stockoutNotification(created));
  return ok(created, 201);
}

function inbox(method: string, parts: string[], query: URLSearchParams): Reply {
  const [, target, action] = parts;
  if (method === 'GET' && target === undefined) {
    const unread = query.get('unread') === 'true';
    const limit = Math.min(Number(query.get('limit') ?? 50) || 50, 100);
    return ok(state.notifications.filter((n) => !unread || n.read_at === null).slice(0, limit));
  }
  if (method === 'GET' && target === 'unread-count') {
    return ok({ unread: state.notifications.filter((n) => n.read_at === null).length });
  }
  if (method === 'POST' && target === 'read-all') {
    const unread = state.notifications.filter((n) => n.read_at === null);
    for (const n of unread) n.read_at = new Date().toISOString();
    return ok({ marked: unread.length });
  }
  if (method === 'POST' && target && action === 'read') {
    const found = state.notifications.find((n) => n.id === target);
    if (!found) return fail(404, 'notification not found');
    found.read_at ??= new Date().toISOString();
    return ok(null);
  }
  return fail(404, 'Not found');
}

/** Answers `/orders…` and `/notifications…`, or returns null for any other path. */
export function handleDcfp(
  method: string,
  parts: string[],
  body: Body,
  query: URLSearchParams,
): Reply | null {
  const [resource, target, segment, action] = parts;
  if (resource === 'notifications') return inbox(method, parts, query);
  if (resource !== 'orders') return null;
  if (target === undefined)
    return method === 'GET' ? ok(state.orders) : fail(405, 'Method not allowed');
  if (target === 'stockouts') {
    if (segment !== undefined) {
      const r = state.reports.find((candidate) => candidate.id === segment);
      if (!r) return fail(404, 'stockout notification not found');
      if (method === 'GET' && action === undefined) return ok(stockoutDetail(r));
      if (method === 'POST' && action === 'deliveries') return deliver(r, body);
      return fail(404, 'Not found');
    }
    if (method === 'GET') return ok(state.reports);
    if (method === 'POST') return reportStockout(body);
  }
  if (target === 'warehouse-requests' && method === 'POST') return placeWarehouseOrder(body);
  const found = state.orders.find((candidate) => candidate.id === target);
  if (!found) return fail(404, 'order not found');
  if (method === 'GET' && segment === undefined) return ok(found);
  if (method === 'GET' && segment === 'events') {
    return ok(state.events.filter((event) => event.order_id === found.id).reverse());
  }
  if (method === 'POST' && segment === 'actions' && action === 'receive')
    return receive(found, body);
  if (method === 'POST' && segment === 'actions') return fail(404, 'unknown order action');
  return fail(404, 'Not found');
}
