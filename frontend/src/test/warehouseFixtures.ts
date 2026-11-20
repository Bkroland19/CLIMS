import type { Activity, WarehouseRequest } from '@/features/fulfilment/api';
import type { WarehouseStock } from '@/features/warehouse/api';

import { envelope } from './fulfilmentFixtures';

/*
 * Warehouse records as the API sends them, for tests, and a fake of the
 * warehouse endpoints that answers from them. Dates assume today is
 * 2026-11-20 (fake `Date` in the tests that depend on expiry).
 */

export function aWarehouseStock(overrides: Partial<WarehouseStock> = {}): WarehouseStock {
  return {
    code: 'NMS',
    name: 'National Medical Stores',
    location: 'Entebbe',
    stock: { male: 425000, female: 10000 },
    min_levels: { male: 200000, female: 10000 },
    batches: [
      {
        product: 'male',
        batch: 'ENG-2011-003',
        manufactured_on: '2020-11-02',
        expires_on: '2026-10-31',
        quantity: 5000,
      },
      {
        product: 'male',
        batch: 'ENG-2112-007',
        manufactured_on: '2021-12-03',
        expires_on: '2026-12-31',
        quantity: 20000,
      },
      {
        product: 'male',
        batch: 'ENG-2310-044',
        manufactured_on: '2023-10-09',
        expires_on: '2028-09-30',
        quantity: 150000,
      },
      {
        product: 'male',
        batch: 'ENG-2409-117',
        manufactured_on: '2024-09-23',
        expires_on: '2029-08-31',
        quantity: 250000,
      },
      {
        product: 'female',
        batch: 'FC2-2408-044',
        manufactured_on: '2024-08-05',
        expires_on: '2029-07-31',
        quantity: 10000,
      },
    ],
    movements: [],
    ...overrides,
  };
}

interface Answer {
  status: number;
  body?: unknown;
}

interface WarehouseData {
  requests?: WarehouseRequest[];
  stock?: WarehouseStock;
  activity?: Activity[];
}

/**
 * Answers the warehouse endpoints for one store from `data`, the way the
 * mock API does: a request at the other store is not found. Writes answer
 * from `writes` by "METHOD /path", or succeed with an empty body.
 */
export function warehouseApi(data: WarehouseData, writes: Record<string, Answer> = {}) {
  return (request: { method: string; url: string }): Answer => {
    const [path = ''] = request.url.split('?');
    if (request.method !== 'GET') {
      return writes[`${request.method} ${path}`] ?? { status: 200, body: envelope({}) };
    }
    const [, resource = '', store = '', collection = '', id] = path.split('/');
    if (resource !== 'warehouses') return { status: 200, body: envelope([]) };
    const stock = data.stock ?? aWarehouseStock();
    switch (collection) {
      case 'stock':
        return { status: 200, body: envelope(stock) };
      case 'activity':
        return { status: 200, body: envelope(data.activity ?? []) };
      case 'requests': {
        const mine = (data.requests ?? []).filter((candidate) => candidate.warehouse === store);
        if (!id) return { status: 200, body: envelope(mine) };
        const found = mine.find((candidate) => candidate.id === decodeURIComponent(id));
        return found
          ? { status: 200, body: envelope(found) }
          : { status: 404, body: { success: false, message: `Request ${id} is not at ${store}.` } };
      }
      default:
        return { status: 404, body: { success: false, message: 'Not found' } };
    }
  };
}
