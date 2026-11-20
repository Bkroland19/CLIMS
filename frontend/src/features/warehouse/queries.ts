import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import type { WarehouseCode } from '@/features/fulfilment/api';
import { fulfilmentKeys } from '@/features/fulfilment/queries';
import { useApiQuery, useHttp } from '@/lib/api';

import {
  acceptWarehouseRequest,
  dispatchWarehouseRequest,
  getWarehouseRequest,
  getWarehouseStock,
  holdWarehouseRequest,
  listWarehouseActivity,
  listWarehouseRequests,
  openWarehouseRequest,
  requeueWarehouseRequest,
  type DispatchRequestInput,
  type HoldRequestInput,
} from './api';

/*
 * Every key starts with `warehouse` and the store: one action moves requests,
 * stock and activity together, so each write refetches the store's lot. It
 * refetches the district's fulfilment views too, since a district request is
 * the same record on both sides.
 */
const ROOT = 'warehouse';
export const warehouseKeys = {
  all: [ROOT] as const,
  store: (store: WarehouseCode) => [ROOT, store] as const,
  requests: (store: WarehouseCode) => [ROOT, store, 'requests'] as const,
  request: (store: WarehouseCode, id: string) => [ROOT, store, 'requests', id] as const,
  stock: (store: WarehouseCode) => [ROOT, store, 'stock'] as const,
  activity: (store: WarehouseCode) => [ROOT, store, 'activity'] as const,
};

export function useWarehouseRequests(store: WarehouseCode, options: { enabled?: boolean } = {}) {
  return useApiQuery(
    warehouseKeys.requests(store),
    (http, signal) => listWarehouseRequests(http, store, signal),
    options,
  );
}

export function useWarehouseRequest(store: WarehouseCode, id: string) {
  return useApiQuery(warehouseKeys.request(store, id), (http, signal) =>
    getWarehouseRequest(http, store, id, signal),
  );
}

export function useWarehouseStock(store: WarehouseCode) {
  return useApiQuery(warehouseKeys.stock(store), (http, signal) =>
    getWarehouseStock(http, store, signal),
  );
}

export function useWarehouseActivity(store: WarehouseCode) {
  return useApiQuery(warehouseKeys.activity(store), (http, signal) =>
    listWarehouseActivity(http, store, signal),
  );
}

/** A write that refetches the warehouse and district views and, if given, says what it did. */
function useWarehouseMutation<Input>(
  write: (input: Input) => Promise<unknown>,
  success: ((input: Input) => string) | null,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: write,
    onSuccess: async (_result, input) => {
      if (success) toast.success(success(input));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: warehouseKeys.all }),
        queryClient.invalidateQueries({ queryKey: fulfilmentKeys.all }),
      ]);
    },
    // The request page shows each failure next to the action that failed.
    meta: { handlesOwnErrors: true },
  });
}

/** Marks a new request as under review, quietly: it happens when the page opens. */
export function useOpenWarehouseRequest(store: WarehouseCode, id: string) {
  const http = useHttp();
  return useWarehouseMutation<undefined>(() => openWarehouseRequest(http, store, id), null);
}

export function useAcceptWarehouseRequest(store: WarehouseCode) {
  const http = useHttp();
  return useWarehouseMutation(
    (id: string) => acceptWarehouseRequest(http, store, id),
    (id) => `${id} accepted and queued.`,
  );
}

export function useHoldWarehouseRequest(store: WarehouseCode, id: string, district: string) {
  const http = useHttp();
  return useWarehouseMutation(
    (input: HoldRequestInput) => holdWarehouseRequest(http, store, id, input),
    () => `${id} is on hold. ${district} DCFP has been notified.`,
  );
}

export function useRequeueWarehouseRequest(store: WarehouseCode, id: string) {
  const http = useHttp();
  return useWarehouseMutation<undefined>(
    () => requeueWarehouseRequest(http, store, id),
    () => `${id} is back in the queue. Check stock again.`,
  );
}

export function useDispatchWarehouseRequest(store: WarehouseCode, id: string, district: string) {
  const http = useHttp();
  return useWarehouseMutation(
    (input: DispatchRequestInput) => dispatchWarehouseRequest(http, store, id, input),
    () => `${id} dispatched to ${district} district store.`,
  );
}
