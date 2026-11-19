import type { HttpClient } from '@/lib/api';
import type { AppStore } from '@/store/store';

import { refreshTokens } from './api';
import { selectSession, tokensRefreshed } from './authSlice';

/**
 * Builds the HTTP client's `refresh` hook. Requests rejected together share
 * one refresh, since each refresh token works only once. When the rejected
 * token is no longer current, another request or tab has already refreshed,
 * so the request is retried without spending the refresh token again.
 */
export function createSessionRefresher(store: AppStore, http: () => HttpClient) {
  let pending: Promise<boolean> | null = null;

  return (rejectedToken: string): Promise<boolean> => {
    const session = selectSession(store.getState());
    if (!session) return Promise.resolve(false);
    if (session.token !== rejectedToken) return Promise.resolve(true);
    const refreshToken = session.refresh_token;
    if (!refreshToken) return Promise.resolve(false);

    pending ??= refreshTokens(http(), refreshToken)
      .then(
        (tokens) => {
          store.dispatch(tokensRefreshed(tokens));
          return true;
        },
        () => false,
      )
      .finally(() => {
        pending = null;
      });
    return pending;
  };
}
