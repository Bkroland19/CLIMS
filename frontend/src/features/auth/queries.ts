import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';
import { toast } from 'sonner';

import { useApiQuery, useHttp } from '@/lib/api';
import { useAppDispatch, useAppSelector } from '@/store/hooks';

import { getCurrentUser, listMySessions, revokeMySession } from './api';
import { selectCurrentUser, sessionEnded, userRefreshed } from './authSlice';
import { describeDevice, type DeviceSession } from './deviceSessions';
import { hasPermissions } from './session';

export const authKeys = {
  me: ['auth', 'me'] as const,
  sessions: ['auth', 'sessions'] as const,
};

/** The signed-in user changes rarely; a page load, or a change made here, refreshes it. */
const ME_STALE_TIME = 5 * 60_000;

/**
 * Keeps the signed-in user in step with the server (`GET /auth/me`): roles and
 * permissions an administrator changed take effect without signing in again.
 * A deactivated account is refused with 403 on every request, so it is signed
 * out here rather than left on screens that can no longer load.
 *
 * Mount once, inside the signed-in shell.
 */
export function useCurrentUserSync(): void {
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();
  const me = useApiQuery(authKeys.me, getCurrentUser, { staleTime: ME_STALE_TIME });

  useEffect(() => {
    if (me.data) dispatch(userRefreshed(me.data));
  }, [dispatch, me.data]);

  const deactivated = me.error?.kind === 'forbidden';
  useEffect(() => {
    if (!deactivated) return;
    dispatch(sessionEnded());
    queryClient.clear();
    toast.error('Your account has been deactivated. Ask an administrator to reactivate it.');
  }, [deactivated, dispatch, queryClient]);
}

/**
 * Returns a check for permission codes: `can('users:create', 'roles:assign')`
 * is true when the signed-in user holds all of them. Use it to leave out
 * actions the API would refuse; the API still decides.
 */
export function useCan(): (...codes: string[]) => boolean {
  const user = useAppSelector(selectCurrentUser);
  return useCallback((...codes: string[]) => hasPermissions(user, codes), [user]);
}

/** Where the signed-in user is signed in. Read only while `enabled`, e.g. while its dialog is open. */
export function useMySessions(enabled: boolean) {
  return useApiQuery(authKeys.sessions, listMySessions, { enabled, staleTime: 0 });
}

/** Signs one of the user's own devices out. The devices dialog shows a failure itself. */
export function useRevokeMySession() {
  const http = useHttp();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (session: DeviceSession) => revokeMySession(http, session.id),
    onSuccess: (_data, session) => {
      toast.success(`Signed out of ${describeDevice(session.user_agent).label}`);
    },
    // Signed out already counts as done: either way the list is out of date.
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: authKeys.sessions });
    },
    meta: { handlesOwnErrors: true },
  });
}
