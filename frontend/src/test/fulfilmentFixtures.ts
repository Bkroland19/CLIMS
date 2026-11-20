import type {
  Activity,
  DistrictStore,
  HotspotOrder,
  Rider,
  WarehouseRequest,
} from '@/features/fulfilment/api';

/*
 * Fulfilment records as the API sends them, for tests. Each builder gives a
 * plausible record; pass only the fields a test is about.
 */

export function anOrder(overrides: Partial<HotspotOrder> = {}): HotspotOrder {
  return {
    id: 'ORD-0141',
    hotspot: {
      id: 'HS-0231',
      name: 'Kasenyi Landing Site',
      kind: 'Permanent',
      village: 'Kasenyi',
      subcounty: 'Katabi TC',
      district: 'Wakiso',
      contact_name: 'Grace Nakato',
      contact_phone: '+256 772 418 903',
      dispenser: 'Working',
      vhts: ['Joseph Ssemwogerere'],
    },
    requested: { male: 800, female: 40 },
    approved: { male: 800, female: 40 },
    stock_at_hotspot: { male: 0, female: 0 },
    reason: 'Out of stock',
    note: null,
    status: 'queued',
    requested_by: { name: 'Grace Nakato', role: 'Hotspot manager' },
    created_at: '2026-11-19T07:35:00Z',
    confirmed_at: null,
    hold_reason: null,
    warehouse_request_id: null,
    allocation: [],
    delivery: null,
    received_at: null,
    ...overrides,
  };
}

export function aRequest(overrides: Partial<WarehouseRequest> = {}): WarehouseRequest {
  return {
    id: 'WR-2026-0032',
    warehouse: 'NMS',
    district: 'Wakiso',
    requested_by: 'Sarah Namubiru',
    items: { male: 6000, female: 300 },
    linked_orders: [],
    note: null,
    status: 'sent',
    created_at: '2026-11-17T08:00:00Z',
    hold_reason: null,
    dispatch: null,
    receipt: null,
    ...overrides,
  };
}

export const DISPATCH_DETAILS: NonNullable<WarehouseRequest['dispatch']> = {
  dispatched_at: '2026-11-19T04:00:00Z',
  waybill: 'WB-NMS-26-1187',
  vehicle: 'UBF 903T',
  driver: 'Robert Ssali',
  items: { male: 6000, female: 300 },
  lines: [
    {
      product: 'male',
      batch: 'ENG-2409-117',
      manufactured_on: '2024-09-23',
      expires_on: '2029-08-31',
      quantity: 6000,
    },
    {
      product: 'female',
      batch: 'FC2-2408-044',
      manufactured_on: '2024-08-05',
      expires_on: '2029-07-31',
      quantity: 300,
    },
  ],
};

export function aStore(overrides: Partial<DistrictStore> = {}): DistrictStore {
  return {
    name: 'Wakiso district store',
    district: 'Wakiso',
    stock: { male: 1400, female: 60 },
    min_levels: { male: 5000, female: 300 },
    batches: [
      {
        product: 'male',
        batch: 'ENG-2206-021',
        manufactured_on: '2022-06-02',
        expires_on: '2027-01-31',
        quantity: 400,
      },
      {
        product: 'male',
        batch: 'ENG-2407-088',
        manufactured_on: '2024-07-08',
        expires_on: '2029-06-30',
        quantity: 1000,
      },
      {
        product: 'female',
        batch: 'FC2-2405-031',
        manufactured_on: '2024-05-20',
        expires_on: '2029-04-30',
        quantity: 60,
      },
    ],
    movements: [],
    ...overrides,
  };
}

export const RIDERS: Rider[] = [
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
];

export function anEvent(overrides: Partial<Activity> = {}): Activity {
  return {
    id: 'EV-1',
    at: '2026-11-19T07:35:00Z',
    actor: 'Grace Nakato',
    role: 'hotspot_manager',
    role_label: 'Hotspot manager',
    text: 'Notified a stockout at Kasenyi Landing Site',
    reference: 'ORD-0141',
    ...overrides,
  };
}

/** Wraps data as the Go API does, so tests exercise the envelope unwrapping too. */
export const envelope = (data: unknown) => ({ success: true, data });

export interface FulfilmentData {
  orders?: HotspotOrder[];
  requests?: WarehouseRequest[];
  store?: DistrictStore;
  riders?: Rider[];
  activity?: Activity[];
}

interface Answer {
  status: number;
  body?: unknown;
}

const notFound = (what: string): Answer => ({
  status: 404,
  body: { success: false, message: `${what} was not found.` },
});

/**
 * A stand-in for the fulfilment API, for `renderApp`'s `replies`: answers the
 * reads from `data` and every write from `writes` (keyed "POST /path"), or
 * with an empty success. Screens ask for several resources at once, in no
 * fixed order, so replies are chosen by address rather than position.
 */
export function fulfilmentApi(data: FulfilmentData, writes: Record<string, Answer> = {}) {
  return (request: { method: string; url: string }): Answer => {
    const [path = ''] = request.url.split('?');
    if (request.method !== 'GET') {
      return writes[`${request.method} ${path}`] ?? { status: 200, body: envelope({}) };
    }
    const [, resource = '', id] = path.split('/');
    switch (resource) {
      case 'hotspot-orders': {
        const orders = data.orders ?? [];
        if (!id) return { status: 200, body: envelope(orders) };
        const order = orders.find((candidate) => candidate.id === decodeURIComponent(id));
        return order ? { status: 200, body: envelope(order) } : notFound('Order');
      }
      case 'warehouse-requests': {
        const requests = data.requests ?? [];
        if (!id) return { status: 200, body: envelope(requests) };
        const found = requests.find((candidate) => candidate.id === decodeURIComponent(id));
        return found ? { status: 200, body: envelope(found) } : notFound('Request');
      }
      case 'district-store':
        return { status: 200, body: envelope(data.store ?? aStore()) };
      case 'riders':
        return { status: 200, body: envelope(data.riders ?? RIDERS) };
      case 'activity':
        return { status: 200, body: envelope(data.activity ?? []) };
      default:
        return notFound(path);
    }
  };
}
