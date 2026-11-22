import { describe, expect, it, vi } from 'vitest';

import { ApiError, type HttpClient } from '@/lib/api';
import { alert, balance, request } from '@/test/districtFixtures';

import {
  dispatchAlert,
  explainMovementError,
  explainOrderError,
  listAllOrders,
  listMovements,
  listStock,
  receiveRequest,
  recordMovement,
  requestReplenishment,
} from './api';

const envelope = (data: unknown) => ({ success: true, data });

function fakeHttp() {
  return {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  } as unknown as HttpClient & { get: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn> };
}

const refused = (status: number, message: string) =>
  new ApiError({
    kind: status === 409 ? 'conflict' : status === 422 ? 'validation' : 'forbidden',
    status,
    message,
  });

describe('listAllOrders', () => {
  it('pages through one status, newest first, and says when the list is complete', async () => {
    const http = fakeHttp();
    const full = Array.from({ length: 100 }, (_, index) => alert(`a-${String(index)}`));
    http.get
      .mockResolvedValueOnce(envelope(full))
      .mockResolvedValueOnce(envelope([request('r-1', 'a-1')]));

    const { items, complete } = await listAllOrders(http, 'queued');

    expect(http.get).toHaveBeenNthCalledWith(1, '/orders?limit=100&offset=0&status=queued', {
      signal: undefined,
    });
    expect(http.get).toHaveBeenNthCalledWith(2, '/orders?limit=100&offset=100&status=queued', {
      signal: undefined,
    });
    expect(items).toHaveLength(101);
    expect(complete).toBe(true);
  });

  it('asks for every status when none is given', async () => {
    const http = fakeHttp();
    http.get.mockResolvedValue(envelope([]));

    await listAllOrders(http, null);

    expect(http.get).toHaveBeenCalledWith('/orders?limit=100&offset=0', { signal: undefined });
  });

  it('refuses an order whose status the API does not document', async () => {
    const http = fakeHttp();
    http.get.mockResolvedValue(envelope([{ ...alert('a-1'), order_status: 'lost' }]));

    await expect(listAllOrders(http, null)).rejects.toMatchObject({ kind: 'unexpected_response' });
  });
});

describe('reads', () => {
  it('reads the store’s balances and a filtered page of its ledger', async () => {
    const http = fakeHttp();
    http.get.mockResolvedValueOnce(envelope([balance()])).mockResolvedValueOnce(envelope([]));

    expect(await listStock(http)).toEqual([balance()]);
    const page = await listMovements(http, {
      reason: 'adjustment',
      from: '2026-11-01',
      to: null,
      page: 2,
    });

    expect(http.get).toHaveBeenLastCalledWith(
      '/inventory/movements?limit=50&offset=100&reason=adjustment&from=2026-11-01',
      { signal: undefined },
    );
    expect(page).toEqual({ movements: [], hasMore: false });
  });
});

describe('writes', () => {
  it('sends stock for an alert and asks the warehouse with the action’s own fields', async () => {
    const http = fakeHttp();
    http.post
      .mockResolvedValueOnce(alert('a-1', { order_status: 'dispatched' }))
      .mockResolvedValueOnce(request('r-1', 'a-2'));

    await dispatchAlert(http, 'a-1', {
      rider_id: 'u-1',
      unit_of_measure_id: 'u-box',
      quantity_issued: 3,
    });
    const made = await requestReplenishment(http, 'a-2', {
      warehouse_store_id: 'store-nms',
      unit_of_measure_id: 'u-box',
      quantity: 20,
    });

    expect(http.post).toHaveBeenNthCalledWith(1, '/orders/a-1/actions/dispatch', {
      rider_id: 'u-1',
      unit_of_measure_id: 'u-box',
      quantity_issued: 3,
    });
    expect(http.post).toHaveBeenNthCalledWith(2, '/orders/a-2/actions/request-replenishment', {
      warehouse_store_id: 'store-nms',
      unit_of_measure_id: 'u-box',
      quantity: 20,
    });
    expect(made.parent_order_id).toBe('a-2');
  });

  it('leaves the discrepancy note out of a receipt that matches', async () => {
    const http = fakeHttp();
    http.post.mockResolvedValue(request('r-1', 'a-1', { order_status: 'received' }));

    await receiveRequest(http, 'r-1', { quantity_received: 20, discrepancy_note: null });
    await receiveRequest(http, 'r-1', { quantity_received: 18, discrepancy_note: 'Two damaged' });

    expect(http.post).toHaveBeenNthCalledWith(1, '/orders/r-1/actions/receive', {
      quantity_received: 20,
    });
    expect(http.post).toHaveBeenNthCalledWith(2, '/orders/r-1/actions/receive', {
      quantity_received: 18,
      discrepancy_note: 'Two damaged',
    });
  });

  it('puts a refusal in the DCFP’s words on the field it concerns', async () => {
    const http = fakeHttp();
    http.post.mockRejectedValue(
      refused(
        409,
        'not enough available stock at the district store; request it from the warehouse',
      ),
    );

    await expect(
      dispatchAlert(http, 'a-1', {
        rider_id: 'u-1',
        unit_of_measure_id: 'u-box',
        quantity_issued: 99,
      }),
    ).rejects.toMatchObject({
      kind: 'conflict',
      status: 409,
      fieldErrors: {
        quantity_issued: [expect.stringMatching(/does not have that much available/)],
      },
    });
  });

  it('records stock and explains a reduction below what is reserved', async () => {
    const http = fakeHttp();
    http.post.mockRejectedValue(
      refused(409, 'adjustment would leave less stock on hand than is reserved for open orders'),
    );
    const input = {
      store_id: 'store-wakiso',
      condom_id: 'p-1',
      unit_of_measure_id: 'u-box',
      reason: 'adjustment' as const,
      quantity: -50,
      note: 'Count',
    };

    await expect(recordMovement(http, input)).rejects.toMatchObject({
      fieldErrors: { quantity: [expect.stringMatching(/less on hand than is held/)] },
    });
    expect(http.post).toHaveBeenCalledWith('/inventory/movements', input);
  });
});

describe('explainOrderError', () => {
  const said = (action: Parameters<typeof explainOrderError>[0], error: unknown) =>
    explainOrderError(action, error);

  it.each([
    ['dispatch', refused(422, 'action requires valid shipment or receipt details'), 'rider_id'],
    [
      'receive',
      refused(422, 'action requires valid shipment or receipt details'),
      'discrepancy_note',
    ],
  ] as const)('puts a %s refusal on its field', (action, error, field) => {
    expect(Object.keys(said(action, error).fieldErrors)).toEqual([field]);
  });

  it.each([
    [
      'dispatch',
      refused(409, 'action is unavailable in the current order state'),
      /already been dealt with/,
    ],
    [
      'request-replenishment',
      refused(409, 'action is unavailable in the current order state'),
      /open warehouse request/,
    ],
    [
      'receive',
      refused(409, 'action is unavailable in the current order state'),
      /no longer waiting to be received/,
    ],
    [
      'dispatch',
      refused(422, "hotspot has no district with a store; set the hotspot's district"),
      /district has no store/,
    ],
    [
      'dispatch',
      refused(422, 'a referenced user, store, product or unit does not exist'),
      /no longer exists/,
    ],
    [
      'request-replenishment',
      refused(422, 'action requires valid shipment or receipt details'),
      /national warehouse/,
    ],
    ['dispatch', refused(403, 'this action is outside your assignment'), /another store/],
  ] as const)('words a %s refusal for the DCFP', (action, error, message) => {
    expect(said(action, error).message).toMatch(message);
  });

  it('passes other failures through unchanged', () => {
    const offline = new ApiError({ kind: 'network', message: 'Could not reach the server.' });

    expect(said('dispatch', offline)).toBe(offline);
  });
});

describe('explainMovementError', () => {
  it.each([
    ['a receipt needs a positive quantity', 'quantity'],
    ['an adjustment needs a nonzero quantity and a note explaining it', 'note'],
    ['note must be at most 1000 characters', 'note'],
  ])('puts “%s” on %s', (message, field) => {
    expect(Object.keys(explainMovementError(refused(422, message)).fieldErrors)).toEqual([field]);
  });

  it('says a store outside the account’s assignment is refused', () => {
    expect(
      explainMovementError(refused(403, 'this store is outside your assignment')).message,
    ).toBe('You can record stock for your own store only.');
  });
});
