import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type { AuthUser, RefreshedTokens, Session } from './session';

export interface AuthState {
  session: Session | null;
}

const initialState: AuthState = { session: null };

/**
 * Holds the current session. Reducers stay pure: persisting to storage is the
 * store's job (see `createAppStore`), not a side effect in here.
 */
export const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    sessionStarted(state, action: PayloadAction<Session>) {
      state.session = action.payload;
    },
    sessionEnded(state) {
      state.session = null;
    },
    /** Swaps in renewed tokens; the user is unchanged. Ignored once signed out. */
    tokensRefreshed(state, action: PayloadAction<RefreshedTokens>) {
      if (!state.session) return;
      state.session.token = action.payload.token;
      state.session.refresh_token = action.payload.refresh_token;
    },
    /**
     * Replaces the user with the server's current copy (`GET /auth/me`), so a
     * role or permission change made by an administrator applies without
     * signing in again. Ignored once signed out.
     */
    userRefreshed(state, action: PayloadAction<AuthUser>) {
      if (!state.session) return;
      state.session.user = action.payload;
    },
  },
  selectors: {
    selectSession: (state) => state.session,
    selectCurrentUser: (state) => state.session?.user ?? null,
    selectToken: (state) => state.session?.token ?? null,
  },
});

export const { sessionStarted, sessionEnded, tokensRefreshed, userRefreshed } = authSlice.actions;
export const { selectSession, selectCurrentUser, selectToken } = authSlice.selectors;
