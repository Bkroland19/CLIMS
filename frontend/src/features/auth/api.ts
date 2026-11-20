import type { HttpClient } from '@/lib/api';
import { parseBody } from '@/lib/api';

import {
  refreshedTokensSchema,
  sessionSchema,
  type RefreshedTokens,
  type Session,
} from './session';

/** Exchanges the single-use refresh token for new tokens. Rejects when the session has ended. */
export async function refreshTokens(
  http: HttpClient,
  refreshToken: string,
): Promise<RefreshedTokens> {
  const body = await http.post(
    '/auth/refresh',
    { refresh_token: refreshToken },
    { anonymous: true },
  );
  return parseBody(refreshedTokensSchema, body, 'refresh');
}

export interface Credentials {
  /** An email address, username or phone number. */
  login: string;
  password: string;
}

/** Ends the server session behind the current token, so the token is rejected from then on. */
export async function signOut(http: HttpClient): Promise<void> {
  await http.post('/auth/logout');
}

/** Exchanges credentials for a session. Wrong credentials reject with an `unauthorized` ApiError. */
export async function signIn(http: HttpClient, credentials: Credentials): Promise<Session> {
  const body = await http.post('/auth/login', credentials, { anonymous: true });
  return parseBody(sessionSchema, body, 'login');
}
