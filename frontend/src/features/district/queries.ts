import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { useLookups, useProducts } from '@/features/catalogue/queries';
import { useStores } from '@/features/geography/queries';
import { useAllHotspots } from '@/features/hotspots/queries';
import { notificationKeys } from '@/features/notifications/queries';
import { useApiQuery, useHttp } from '@/lib/api';

import {
  dispatchAlert,
  getOrder,
  listAllOrders,
  listHotspotStock,
  listMovements,
  listOrderEvents,
  listRiders,
  listStock,
  receiveRequest,
  recordMovement,
  requestReplenishment,
  type DispatchInput,
  type MovementFilter,
  type MovementInput,
  type OrderStatus,
  type ReceiveInput,
  type ReplenishmentInput,
} from './api';
import { districtNames } from './names';

/*
 * Every key starts with `district`: one action moves orders, stock and the
 * ledger together (sending stock reserves and dispatches it; receiving a
 * shipment credits the store), so each write refetches the lot, and the
 * inbox it notified, rather than guessing which views it touched.
 */
const ROOT = 'district';
export const districtKeys = {
  all: [ROOT] as const,
  orders: (status: OrderStatus | null) => [ROOT, 'orders', status ?? 'any'] as const,
  order: (id: string) => [ROOT, 'order', id] as const,
  events: (id: string) => [ROOT, 'order', id, 'events'] as const,
  riders: [ROOT, 'riders'] as const,
  stock: [ROOT, 'stock'] as const,
  movements: (filter: MovementFilter) => [ROOT, 'movements', filter] as const,
  hotspotStock: [ROOT, 'hotspot-stock'] as const,
};

/** `enabled: false` holds the request back, e.g. for badges outside the DCFP workspace. */
interface ReadOptions {
  enabled?: boolean;
}

/** Every order of one status the DCFP can see, alerts and requests mixed; see `kindOf`. */
export function useOrders(status: OrderStatus | null, options: ReadOptions = {}) {
  return useApiQuery(
    districtKeys.orders(status),
    (http, signal) => listAllOrders(http, status, signal),
    options,
  );
}

export function useOrder(id: string, options: ReadOptions = {}) {
  return useApiQuery(districtKeys.order(id), (http, signal) => getOrder(http, id, signal), options);
}

export function useOrderEvents(id: string) {
  return useApiQuery(districtKeys.events(id), (http, signal) => listOrderEvents(http, id, signal));
}

export function useRiders(options: ReadOptions = {}) {
  return useApiQuery(districtKeys.riders, listRiders, options);
}

export function useStock(options: ReadOptions = {}) {
  return useApiQuery(districtKeys.stock, listStock, options);
}

export function useMovements(filter: MovementFilter) {
  return useApiQuery(districtKeys.movements(filter), (http, signal) =>
    listMovements(http, filter, signal),
  );
}

export function useHotspotStock(options: ReadOptions = {}) {
  return useApiQuery(districtKeys.hotspotStock, listHotspotStock, options);
}

/**
 * Names for the ids on the district's orders: its hotspots, the catalogue and
 * the stores. `isPending` is true until all four lists have loaded.
 */
export function useDistrictNames() {
  const hotspots = useAllHotspots();
  const products = useProducts();
  const units = useLookups('units');
  const stores = useStores();
  const sources = [hotspots, products, units, stores];
  return {
    names: districtNames({
      hotspots: hotspots.data?.items,
      products: products.data,
      units: units.data,
      stores: stores.data,
    }),
    isPending: sources.some((source) => source.isPending),
    error: sources.find((source) => source.error)?.error ?? null,
    retry: () => {
      for (const source of sources) if (source.isError) void source.refetch();
    },
  };
}

/** A district write that refetches every district view and the inbox, and says what it did. */
function useDistrictMutation<Input, Result>(
  write: (input: Input) => Promise<Result>,
  success: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: write,
    onSuccess: async () => {
      toast.success(success);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: districtKeys.all }),
        queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
      ]);
    },
    // Each form shows the refusal next to the field or action it concerns.
    meta: { handlesOwnErrors: true },
  });
}

export function useDispatchAlert(alertId: string) {
  const http = useHttp();
  return useDistrictMutation(
    (input: DispatchInput) => dispatchAlert(http, alertId, input),
    'Stock sent. The rider can now deliver it.',
  );
}

export function useRequestReplenishment(alertId: string) {
  const http = useHttp();
  return useDistrictMutation(
    (input: ReplenishmentInput) => requestReplenishment(http, alertId, input),
    'Request sent to the warehouse. The alert waits on hold until the stock arrives.',
  );
}

export function useReceiveRequest(requestId: string) {
  const http = useHttp();
  return useDistrictMutation(
    (input: ReceiveInput) => receiveRequest(http, requestId, input),
    'Shipment received. District stock updated.',
  );
}

export function useRecordMovement() {
  const http = useHttp();
  return useDistrictMutation(
    (input: MovementInput) => recordMovement(http, input),
    'Stock recorded.',
  );
}
