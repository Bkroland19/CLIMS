import { useInfiniteQuery } from '@tanstack/react-query';

import { useHttp, type ApiError } from '@/lib/api';

import { listSyncLog, PAGE_SIZE, type SyncLogEntry, type SyncLogFilters } from './api';

export const syncLogKeys = {
  all: ['sync-log'] as const,
  list: (filters: SyncLogFilters) => ['sync-log', filters] as const,
};

/**
 * The sync log, a page at a time; `fetchNextPage` reads the next. Phones upload within seconds of
 * a change, so the list refreshes when the window regains focus.
 */
export function useSyncLog(filters: SyncLogFilters) {
  const http = useHttp();
  // `http` is deliberately not part of the key: it is the one client for the
  // provider's lifetime, and a key must be serialisable data.
  // eslint-disable-next-line @tanstack/query/exhaustive-deps
  return useInfiniteQuery<SyncLogEntry[], ApiError>({
    queryKey: syncLogKeys.list(filters),
    queryFn: ({ pageParam, signal }) =>
      listSyncLog(http, filters, typeof pageParam === 'number' ? pageParam : 0, signal),
    initialPageParam: 0,
    // A short page is the last one; the API gives no total.
    getNextPageParam: (lastPage, pages) =>
      lastPage.length < PAGE_SIZE ? undefined : pages.length * PAGE_SIZE,
    staleTime: 60_000,
  });
}
