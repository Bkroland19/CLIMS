import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import {
  getStoreSummary,
  listMovements,
  recordMovement,
  recordReceipt,
  type MovementInput,
  type ReceiptInput,
} from '@/features/inventory/api';
import { useApiQuery, useHttp } from '@/lib/api';

import { warehouseOrderKeys } from './orderQueries';

/*
 * A warehouse's ledger on the Go API, and the writes that change its stock. Recording a delivery
 * or adjusting a batch changes the balances, the batches and the ledger, and what an order's
 * approval and dispatch see, so each write refetches the lot.
 */
const ROOT = 'warehouse-stock';
export const warehouseStockKeys = {
  all: [ROOT] as const,
  movements: (storeId: string) => [ROOT, storeId, 'movements'] as const,
};

/**
 * The store's figures for a period. Kept under the order keys, so an order step (an approval
 * reserves stock, a dispatch moves it) refetches them as well as a delivery or adjustment does.
 */
export function useStoreSummary(
  storeId: string | undefined,
  period: { from: string; to: string },
  options: { enabled?: boolean } = {},
) {
  return useApiQuery(
    [...warehouseOrderKeys.all, 'summary', storeId ?? '', period.from, period.to] as const,
    (http, signal) =>
      getStoreSummary(http, { storeId: storeId ?? '', from: period.from, to: period.to }, signal),
    { enabled: (options.enabled ?? true) && storeId !== undefined },
  );
}

export function useStoreMovements(
  storeId: string | undefined,
  options: { enabled?: boolean } = {},
) {
  return useApiQuery(
    warehouseStockKeys.movements(storeId ?? ''),
    (http, signal) => listMovements(http, { storeId, limit: 100 }, signal),
    { enabled: (options.enabled ?? true) && storeId !== undefined },
  );
}

async function refetchStock(queryClient: ReturnType<typeof useQueryClient>) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: warehouseStockKeys.all }),
    queryClient.invalidateQueries({ queryKey: warehouseOrderKeys.all }),
  ]);
}

/** Records a whole delivery, every batch or none. The sheet says what was saved. */
export function useRecordReceipt() {
  const http = useHttp();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ReceiptInput) => recordReceipt(http, input),
    onSuccess: () => refetchStock(queryClient),
    // The form shows the failure on the line that failed.
    meta: { handlesOwnErrors: true },
  });
}

/** Corrects a batch after a count, or writes stock off. */
export function useAdjustBatch() {
  const http = useHttp();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: MovementInput) => recordMovement(http, input),
    onSuccess: async (_movement, input) => {
      toast.success(
        input.batch_number ? `Batch ${input.batch_number} adjusted.` : 'Stock adjusted.',
      );
      await refetchStock(queryClient);
    },
    // The dialog shows the failure next to what failed.
    meta: { handlesOwnErrors: true },
  });
}
