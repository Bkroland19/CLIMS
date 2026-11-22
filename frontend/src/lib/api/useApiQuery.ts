import { useQuery, type QueryKey } from '@tanstack/react-query';

import type { ApiError } from './errors';
import type { HttpClient } from './http';
import { useHttp } from './HttpProvider';

export interface ApiQueryOptions {
  /** How long a result is served from cache before it is refetched. */
  staleTime?: number;
  /** False holds the request back, e.g. until the screen that needs it is open. Defaults to true. */
  enabled?: boolean;
  /**
   * Refetches on this interval in milliseconds while the tab is visible, for
   * figures that change without the user doing anything, e.g. an unread count.
   */
  refetchInterval?: number;
}

/**
 * Reads from the API through the app's HTTP client, cancelling the request if
 * the component that asked for it goes away.
 */
export function useApiQuery<Data>(
  queryKey: QueryKey,
  fetcher: (http: HttpClient, signal: AbortSignal) => Promise<Data>,
  options: ApiQueryOptions = {},
) {
  const http = useHttp();
  // `http` is deliberately not part of the key: it is the one client for the
  // provider's lifetime, and a key must be serialisable data.
  // eslint-disable-next-line @tanstack/query/exhaustive-deps
  return useQuery<Data, ApiError>({
    queryKey,
    queryFn: ({ signal }) => fetcher(http, signal),
    ...options,
  });
}
