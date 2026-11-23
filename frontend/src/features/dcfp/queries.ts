import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { useApiQuery, useHttp } from '@/lib/api';

import {
  createWarehouseOrder,
  getOrder,
  getStockout,
  listStoreStock,
  recordDelivery,
  type DeliveryInput,
  listOrderEvents,
  listOrders,
  listStockouts,
  listWarehouses,
  receiveOrder,
  type ReceiptInput,
  type WarehouseOrderInput,
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
  storeStock: (storeId: string) => [ROOT, 'store-stock', storeId] as const,
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

export function useStockout(id: string) {
  return useApiQuery(dcfpKeys.stockout(id), (http, signal) => getStockout(http, id, signal));
}

/**
 * The district store's balances. Reading them needs `inventory:read`, which not every DCFP
 * account has; callers carry on without them.
 */
export function useStoreStock(storeId: string) {
  return useApiQuery(dcfpKeys.storeStock(storeId), (http, signal) =>
    listStoreStock(http, storeId, signal),
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
  return useMutation({
    mutationFn: (input: ReceiptInput) => receiveOrder(http, id, input),
    onSuccess: async () => {
      toast.success('Receipt recorded; the district store is updated');
      await invalidate();
    },
  });
}

/** Records a delivery from the district store against a stockout report. */
export function useRecordDelivery(id: string) {
  const http = useHttp();
  const invalidate = useInvalidateDcfp();
  return useMutation({
    mutationFn: (input: DeliveryInput) => recordDelivery(http, id, input),
    onSuccess: async () => {
      toast.success('Delivery recorded; the hotspot is asked to confirm what arrived');
      await invalidate();
    },
  });
}
