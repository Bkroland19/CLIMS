import { z } from 'zod';

import { roleSchema } from '@/lib/api/schema';
import { readJson, removeKey, writeJson, type StorageLike } from '@/lib/storage/jsonStorage';

/**
 * The signed-in user as this app needs it. Fields beyond `id` are optional in
 * practice on the legacy API, so they are nullable rather than assumed.
 */
export const authUserSchema = z.object({
  // The Go API's user IDs are UUID strings; the legacy API sent numbers.
  id: z.union([z.string().min(1), z.number().int()]).transform(String),
  username: z.string().min(1),
  // The Go API sends `{ id, name, permissions }`; older APIs a name or an id.
  role: roleSchema,
  firstname: z.string().nullish().default(null),
  lastname: z.string().nullish().default(null),
  email: z.string().nullish().default(null),
});

export const sessionSchema = z.object({
  /** Short-lived access token, renewed with the refresh token when it expires. */
  token: z.string().min(1),
  /** Single-use; `null` for sessions from an API without refresh, which then sign out on expiry. */
  refresh_token: z.string().min(1).nullish(),
  user: authUserSchema,
});

/** What `POST /auth/refresh` returns: a new access token and the refresh token that replaces the old one. */
export const refreshedTokensSchema = z.object({
  token: z.string().min(1),
  refresh_token: z.string().min(1),
});

export type RefreshedTokens = z.infer<typeof refreshedTokensSchema>;

export type AuthUser = z.infer<typeof authUserSchema>;
export type Session = z.infer<typeof sessionSchema>;

const SESSION_KEY = 'clims.session';

/** Persists the session so a page reload does not sign the user out. */
export interface SessionStore {
  load(): Session | null;
  save(session: Session): void;
  clear(): void;
  /** The storage key, for matching cross-tab `storage` events. */
  readonly key: string;
}

export function createSessionStore(storage: StorageLike): SessionStore {
  return {
    key: SESSION_KEY,
    load: () =>
      readJson(storage, SESSION_KEY, (value) => {
        const result = sessionSchema.safeParse(value);
        return result.success ? result.data : null;
      }),
    save: (session) => {
      writeJson(storage, SESSION_KEY, session);
    },
    clear: () => {
      removeKey(storage, SESSION_KEY);
    },
  };
}
