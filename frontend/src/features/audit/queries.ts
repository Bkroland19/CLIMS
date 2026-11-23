import { useInfiniteQuery } from '@tanstack/react-query';

import { useHttp, type ApiError } from '@/lib/api';

import { listAuditLog, PAGE_SIZE, type AuditEntry, type AuditFilters } from './api';

export const auditKeys = {
  all: ['audit-log'] as const,
  list: (filters: AuditFilters) => ['audit-log', filters] as const,
};

/**
 * The audit log, a page at a time; `fetchNextPage` reads the next. Every read
 * is itself recorded in the log, so results are kept for five minutes and not
 * refetched when the window regains focus.
 */
export function useAuditLog(filters: AuditFilters) {
  const http = useHttp();
  // `http` is deliberately not part of the key: it is the one client for the
  // provider's lifetime, and a key must be serialisable data.
  // eslint-disable-next-line @tanstack/query/exhaustive-deps
  return useInfiniteQuery<AuditEntry[], ApiError>({
    queryKey: auditKeys.list(filters),
    queryFn: ({ pageParam, signal }) =>
      listAuditLog(http, filters, typeof pageParam === 'number' ? pageParam : 0, signal),
    initialPageParam: 0,
    // A short page is the last one; the API gives no total.
    getNextPageParam: (lastPage, pages) =>
      lastPage.length < PAGE_SIZE ? undefined : pages.length * PAGE_SIZE,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
}
