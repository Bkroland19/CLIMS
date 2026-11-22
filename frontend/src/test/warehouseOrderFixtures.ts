import type { Product } from '@/features/catalogue/api';
import type { StockBalance, StockBatch } from '@/features/inventory/api';
import type { Order, OrderEvent } from '@/features/orders/api';

import { anOrder, BOX, FEMALE, JMS, NMS } from './dcfpFixtures';
import type { FakeReply } from './fakeAdapter';
import { warehouseApi } from './warehouseFixtures';

/*
 * The warehouse screens on the Go API, for tests: district orders placed with NMS or JMS, the
 * warehouse's stock and batches, and a fake of the endpoints those screens read.
 */

const envelope = (data: unknown) => ({ success: true, data });

type Answer = Exclude<FakeReply, (...args: never[]) => unknown>;

/** A second female product, so the warehouse has a choice to make at review. */
export const FEMALE_FC2: Product = {
  ...FEMALE,
  id: 'p-fc2',
  brand: { id: 'b-fc2', name: 'FC2' },
};

/** A district store as `GET /locations/stores` lists it; the store id is `store-<code>`. */
export function aDistrictStore(name: string) {
  const code = name.toLowerCase();
  return {
    id: `store-${code}`,
    code,
    name,
    store_type: 'district' as const,
    district_id: `d-${code}`,
    district_name: name,
  };
}

/** An order from Wakiso to NMS for female condoms, waiting for the warehouse. */
export function aWarehouseOrder(overrides: Partial<Order> = {}): Order {
  return anOrder({
    id: 'o1',
    condom_id: null,
    condom_category: 'female',
    ordered_for_store_id: 'store-wakiso',
    ordered_from_store_id: NMS.id,
    ...overrides,
  });
}

export function aBalance(overrides: Partial<StockBalance> = {}): StockBalance {
  return {
    store_id: NMS.id,
    store_name: NMS.name,
    store_type: 'national',
    condom_id: FEMALE.id,
    product: 'Engabu Free Female',
    unit_of_measure_id: BOX.id,
    unit: 'box',
    on_hand: 800,
    reserved: 0,
    available: 800,
    incoming: 0,
    updated_at: '2026-11-20T08:00:00Z',
    ...overrides,
  };
}

export function aStockBatch(overrides: Partial<StockBatch> = {}): StockBatch {
  return {
    id: 'b-late',
    store_id: NMS.id,
    store_name: NMS.name,
    store_type: 'national',
    condom_id: FEMALE.id,
    product: 'Engabu Free Female',
    category: 'female',
    unit_of_measure_id: BOX.id,
    unit: 'box',
    batch_number: 'FC2-2502-118',
    expiry_date: '2028-06-30',
    days_remaining: 588,
    band: 'ok',
    on_hand: 500,
    created_at: '2026-10-01T08:00:00Z',
    ...overrides,
  };
}

export interface WarehouseOrderData {
  orders?: Order[];
  events?: OrderEvent[];
  balances?: StockBalance[];
  batches?: StockBatch[];
  products?: Product[];
  /** Answers for the screens still on the mock-only `/warehouses/…` contract (stock, dashboard). */
  legacy?: Parameters<typeof warehouseApi>[0];
}

/**
 * Answers the warehouse screens' requests by path. Writes answer from `writes` by
 * "METHOD /path", else with the order as it was.
 */
export function warehouseOrderApi(data: WarehouseOrderData, writes: Record<string, Answer> = {}) {
  const orders = data.orders ?? [];
  const legacy = warehouseApi(data.legacy ?? {});
  return (request: { method: string; url: string }): Answer => {
    const [path = ''] = request.url.split('?');
    if (path.startsWith('/warehouses/')) return legacy(request);
    const order = /^\/orders\/([^/]+)/.exec(path);
    if (request.method !== 'GET') {
      return (
        writes[`${request.method} ${path}`] ?? {
          status: 200,
          body: envelope(orders.find((candidate) => candidate.id === order?.[1]) ?? anOrder()),
        }
      );
    }
    if (path === '/orders') return { status: 200, body: envelope(orders) };
    if (order && path.endsWith('/events'))
      return { status: 200, body: envelope(data.events ?? []) };
    if (order) {
      const found = orders.find((candidate) => candidate.id === order[1]);
      return found
        ? { status: 200, body: envelope(found) }
        : { status: 404, body: { success: false, message: 'order not found' } };
    }
    if (path === '/locations/stores') {
      const national = [NMS, JMS].map((store) => ({
        ...store,
        district_id: null,
        district_name: null,
      }));
      const stores = request.url.includes('store_type=national')
        ? national
        : [...national, aDistrictStore('Gulu'), aDistrictStore('Mukono'), aDistrictStore('Wakiso')];
      return { status: 200, body: envelope(stores) };
    }
    if (path === '/inventory/stock') return { status: 200, body: envelope(data.balances ?? []) };
    if (path === '/inventory/batches') return { status: 200, body: envelope(data.batches ?? []) };
    if (path === '/catalogue/products') {
      return { status: 200, body: envelope(data.products ?? [FEMALE, FEMALE_FC2]) };
    }
    if (path === '/catalogue/units') return { status: 200, body: envelope([BOX]) };
    return { status: 200, body: envelope([]) };
  };
}
