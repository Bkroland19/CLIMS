import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { listMovements, recordMovement, type MovementInput } from '@/features/inventory/api';
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

function useStockWrite(success: (input: MovementInput) => string) {
  const http = useHttp();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: MovementInput) => recordMovement(http, input),
    onSuccess: async (_movement, input) => {
      toast.success(success(input));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: warehouseStockKeys.all }),
        queryClient.invalidateQueries({ queryKey: warehouseOrderKeys.all }),
      ]);
    },
    // The form shows the failure next to what failed.
    meta: { handlesOwnErrors: true },
  });
}

/** Records a delivery into a batch. */
export function useRecordDelivery() {
  return useStockWrite((input) =>
    input.batch_number
      ? `Delivery recorded in batch ${input.batch_number}.`
      : 'Delivery recorded without a batch number.',
  );
}

/** Corrects a batch after a count, or writes stock off. */
export function useAdjustBatch() {
  return useStockWrite((input) =>
    input.batch_number ? `Batch ${input.batch_number} adjusted.` : 'Stock adjusted.',
  );
}
