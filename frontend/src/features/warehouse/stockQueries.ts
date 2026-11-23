import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { toast } from 'sonner';

import {
  deleteBatch,
  editBatch,
  getStoreSummary,
  listMovements,
  MOVEMENTS_PAGE_SIZE,
  recordMovement,
  recordReceipt,
  type BatchEditInput,
  type Movement,
  type MovementInput,
  type MovementReason,
  type ReceiptInput,
  type StockBatch,
} from '@/features/inventory/api';
import { batchLabel } from '@/features/inventory/bands';
import { useApiQuery, useHttp, type ApiError } from '@/lib/api';
import { formatNumber } from '@/lib/format';

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

/**
 * The store's whole ledger, newest first, a page of 100 at a time: `loadMore` fetches the next
 * page, and `hasMore` says whether the API holds older entries. A warehouse records thousands of
 * movements a year, so the list never pretends the first page is all of them. `reason` narrows it
 * on the server, so finding the adjustments among thousands of dispatches needs no paging.
 */
export function useMovementLedger(
  storeId: string | undefined,
  reason: MovementReason | null,
  options: { enabled?: boolean } = {},
) {
  const http = useHttp();
  // `http` is the one client for the provider's lifetime, so it is not part of the key.
  // eslint-disable-next-line @tanstack/query/exhaustive-deps
  const query = useInfiniteQuery<Movement[], ApiError>({
    queryKey: [...warehouseStockKeys.movements(storeId ?? ''), 'ledger', reason ?? 'all'],
    queryFn: ({ pageParam, signal }) =>
      listMovements(
        http,
        {
          storeId,
          reason: reason ?? undefined,
          limit: MOVEMENTS_PAGE_SIZE,
          offset: Number(pageParam),
        },
        signal,
      ),
    initialPageParam: 0,
    getNextPageParam: (last, pages) =>
      last.length < MOVEMENTS_PAGE_SIZE ? undefined : pages.length * MOVEMENTS_PAGE_SIZE,
    enabled: (options.enabled ?? true) && storeId !== undefined,
  });
  const { data } = query;
  const rows = useMemo(() => {
    if (!data) return undefined;
    // Entries recorded while paging shift the offsets, so a page can repeat the last one's tail.
    const seen = new Set<string>();
    return data.pages.flat().filter((movement) => {
      if (seen.has(movement.id)) return false;
      seen.add(movement.id);
      return true;
    });
  }, [data]);
  return {
    rows,
    isPending: query.isPending,
    error: query.error,
    refetch: query.refetch,
    isRefetching: query.isRefetching && !query.isFetchingNextPage,
    hasMore: query.hasNextPage,
    isLoadingMore: query.isFetchingNextPage,
    loadMore: () => void query.fetchNextPage(),
  };
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

/**
 * Corrects a batch after a count, or writes stock off. `successMessage` replaces the toast, e.g.
 * when writing off what is left of a batch deletes it from the list.
 */
export function useAdjustBatch(options: { successMessage?: string } = {}) {
  const http = useHttp();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: MovementInput) => recordMovement(http, input),
    onSuccess: async (_movement, input) => {
      toast.success(
        options.successMessage ??
          (input.batch_number ? `Batch ${input.batch_number} adjusted.` : 'Stock adjusted.'),
      );
      await refetchStock(queryClient);
    },
    // The dialog shows the failure next to what failed.
    meta: { handlesOwnErrors: true },
  });
}

/** Corrects a batch's number, expiry date and quantity. */
export function useEditBatch() {
  const http = useHttp();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ batch, input }: { batch: StockBatch; input: BatchEditInput }) =>
      editBatch(http, batch.id, input),
    onSuccess: async (saved, { batch }) => {
      toast.success(
        saved.id === batch.id
          ? `Batch ${batchLabel(saved)} saved.`
          : `Batch ${batchLabel(saved)} now holds ${formatNumber(saved.on_hand)} ${saved.unit}.`,
      );
      await refetchStock(queryClient);
    },
    // A refusal can mean the batch changed under the form: show the latest.
    onError: () => refetchStock(queryClient),
    // The dialog shows the failure next to what failed.
    meta: { handlesOwnErrors: true },
  });
}

/** Erases an untouched batch as if it was never registered. */
export function useDeleteBatch() {
  const http = useHttp();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (batch: StockBatch) => deleteBatch(http, batch.id),
    onSuccess: async (_result, batch) => {
      toast.success(batch.batch_number ? `Batch ${batch.batch_number} deleted.` : 'Batch deleted.');
      await refetchStock(queryClient);
    },
    // Stock may have left the batch since the list loaded: show the latest.
    onError: () => refetchStock(queryClient),
    // The dialog shows the failure.
    meta: { handlesOwnErrors: true },
  });
}
