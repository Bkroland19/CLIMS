import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type { RefreshedTokens, Session } from './session';

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
  },
  selectors: {
    selectSession: (state) => state.session,
    selectCurrentUser: (state) => state.session?.user ?? null,
    selectToken: (state) => state.session?.token ?? null,
  },
});

export const { sessionStarted, sessionEnded, tokensRefreshed } = authSlice.actions;
export const { selectSession, selectCurrentUser, selectToken } = authSlice.selectors;
