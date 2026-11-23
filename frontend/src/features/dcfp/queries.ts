import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { useApiQuery, useHttp } from '@/lib/api';
import { warehouseOrderKeys, warehouseStockKeys } from '@/features/warehouse/queryKeys';

import {
  createWarehouseOrder,
  deliverStock,
  getOrder,
  getStockout,
  listOrderEvents,
  listOrders,
  listStockouts,
  listWarehouses,
  receiveOrder,
  type ReceiptInput,
  type WarehouseOrderInput,
  type HotspotDeliveryInput,
} from './api';

/*
 * Every key starts with `dcfp`. Placing or receiving an order changes the order lists, the
 * order, its history and the counts together, so each write refetches the lot.
 */
const ROOT = 'dcfp';
export const dcfpKeys = {
  all: [ROOT] as const,
  stockouts: [ROOT, 'stockouts'] as const,
  stockout: (id: string) => [ROOT, 'stockouts', id] as const,
  orders: [ROOT, 'orders'] as const,
  order: (id: string) => [ROOT, 'orders', id] as const,
  events: (id: string) => [ROOT, 'orders', id, 'events'] as const,
  warehouses: [ROOT, 'warehouses'] as const,
};

interface ReadOptions {
  enabled?: boolean;
}

export function useStockouts(options: ReadOptions = {}) {
  return useApiQuery(dcfpKeys.stockouts, listStockouts, options);
}

export function useStockout(id: string | undefined) {
  return useApiQuery(
    dcfpKeys.stockout(id ?? ''),
    (http, signal) => getStockout(http, id ?? '', signal),
    { enabled: Boolean(id) },
  );
}

export function useOrders(options: ReadOptions = {}) {
  return useApiQuery(dcfpKeys.orders, listOrders, options);
}

export function useOrder(id: string) {
  return useApiQuery(dcfpKeys.order(id), (http, signal) => getOrder(http, id, signal));
}

export function useOrderEvents(id: string) {
  return useApiQuery(dcfpKeys.events(id), (http, signal) => listOrderEvents(http, id, signal));
}

/** NMS and JMS change rarely, so they are kept for the session. */
export function useWarehouses(options: ReadOptions = {}) {
  return useApiQuery(dcfpKeys.warehouses, listWarehouses, { ...options, staleTime: Infinity });
}

function useInvalidateDcfp() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: dcfpKeys.all });
}

export function useDeliverStock() {
  const http = useHttp();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ reportId, input }: { reportId: string; input: HotspotDeliveryInput }) =>
      deliverStock(http, reportId, input),
    onSuccess: async () => {
      toast.success('Dispatch recorded. The hotspot manager confirms what arrives.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: dcfpKeys.all }),
        queryClient.invalidateQueries({ queryKey: warehouseOrderKeys.all }),
        queryClient.invalidateQueries({ queryKey: warehouseStockKeys.all }),
      ]);
    },
    meta: { handlesOwnErrors: true },
  });
}

export function usePlaceOrder() {
  const http = useHttp();
  const invalidate = useInvalidateDcfp();
  return useMutation({
    mutationFn: (input: WarehouseOrderInput) => createWarehouseOrder(http, input),
    onSuccess: async () => {
      toast.success('Order sent to the warehouse');
      await invalidate();
    },
  });
}

export function useReceiveOrder(id: string) {
  const http = useHttp();
  const invalidate = useInvalidateDcfp();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ReceiptInput) => receiveOrder(http, id, input),
    onSuccess: async () => {
      toast.success('Receipt recorded; the district store is updated');
      await Promise.all([
        invalidate(),
        queryClient.invalidateQueries({ queryKey: warehouseOrderKeys.all }),
        queryClient.invalidateQueries({ queryKey: warehouseStockKeys.all }),
      ]);
    },
  });
}
