import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { useApiQuery, useHttp } from '@/lib/api';

import {
  confirmOrder,
  createRequest,
  dispatchOrder,
  getDistrictStore,
  getOrder,
  getRequest,
  holdOrder,
  listActivity,
  listOrders,
  listRequests,
  listRiders,
  receiveRequest,
  releaseOrder,
  type ConfirmOrderInput,
  type HoldOrderInput,
  type NewRequestInput,
  type PickInput,
  type ReceiveInput,
} from './api';

/*
 * Every key starts with `fulfilment`: one action moves orders, stock and
 * requests together (confirming an order takes stock out of the store;
 * receiving a request puts it back and frees held orders), so each write
 * refetches the lot rather than guessing which views it touched.
 */
const ROOT = 'fulfilment';
export const fulfilmentKeys = {
  all: [ROOT] as const,
  orders: [ROOT, 'orders'] as const,
  order: (id: string) => [ROOT, 'orders', id] as const,
  requests: [ROOT, 'requests'] as const,
  request: (id: string) => [ROOT, 'requests', id] as const,
  store: [ROOT, 'store'] as const,
  riders: [ROOT, 'riders'] as const,
  activity: [ROOT, 'activity'] as const,
};

/** `enabled: false` holds the request back, e.g. for badge counts outside the DCFP workspace. */
interface ReadOptions {
  enabled?: boolean;
}

export function useOrders(options: ReadOptions = {}) {
  return useApiQuery(fulfilmentKeys.orders, listOrders, options);
}

export function useOrder(id: string) {
  return useApiQuery(fulfilmentKeys.order(id), (http, signal) => getOrder(http, id, signal));
}

export function useRequests(options: ReadOptions = {}) {
  return useApiQuery(fulfilmentKeys.requests, listRequests, options);
}

export function useRequest(id: string) {
  return useApiQuery(fulfilmentKeys.request(id), (http, signal) => getRequest(http, id, signal));
}

export function useDistrictStore(options: ReadOptions = {}) {
  return useApiQuery(fulfilmentKeys.store, getDistrictStore, options);
}

export function useRiders() {
  return useApiQuery(fulfilmentKeys.riders, listRiders);
}

export function useActivity() {
  return useApiQuery(fulfilmentKeys.activity, listActivity);
}

/** A write that refetches every fulfilment view and says what it did. */
function useFulfilmentMutation<Input>(
  write: (input: Input) => Promise<unknown>,
  success: (input: Input) => string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: write,
    onSuccess: async (_result, input) => {
      toast.success(success(input));
      await queryClient.invalidateQueries({ queryKey: fulfilmentKeys.all });
    },
    // Each screen shows the failure next to the action that failed.
    meta: { handlesOwnErrors: true },
  });
}

export function useConfirmOrder(id: string) {
  const http = useHttp();
  return useFulfilmentMutation(
    (input: ConfirmOrderInput) => confirmOrder(http, id, input),
    () => `${id} confirmed. The hotspot has been notified.`,
  );
}

export function useHoldOrder(id: string) {
  const http = useHttp();
  return useFulfilmentMutation(
    (input: HoldOrderInput) => holdOrder(http, id, input),
    () => `${id} is on hold.`,
  );
}

/** Releases a held order. Takes the order ID so one list can release any of its rows. */
export function useReleaseOrder() {
  const http = useHttp();
  return useFulfilmentMutation(
    ({ id, lines }: { id: string; lines?: PickInput[] }) =>
      releaseOrder(http, id, lines ? { lines } : {}),
    ({ id }) => `${id} released and confirmed.`,
  );
}

export function useDispatchOrder(id: string) {
  const http = useHttp();
  return useFulfilmentMutation(
    (riderId: string) => dispatchOrder(http, id, riderId),
    () => `${id} handed over to the rider.`,
  );
}

export function useCreateRequest() {
  const http = useHttp();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NewRequestInput) => createRequest(http, input),
    onSuccess: async (id, input) => {
      toast.success(`${id} sent to ${input.warehouse}.`);
      await queryClient.invalidateQueries({ queryKey: fulfilmentKeys.all });
    },
    meta: { handlesOwnErrors: true },
  });
}

export function useReceiveRequest(id: string) {
  const http = useHttp();
  return useFulfilmentMutation(
    (input: ReceiveInput) => receiveRequest(http, id, input),
    () => `${id} received. District stock updated.`,
  );
}
