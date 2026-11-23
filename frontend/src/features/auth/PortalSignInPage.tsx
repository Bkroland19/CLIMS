'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';

import { PageLoader } from '@/components/states/PageLoader';
import { useHttp } from '@/lib/api';
import { HOME_PATH, SIGN_IN_PATH, SSO_ERROR_PARAM } from '@/navigation/paths';
import { useAppDispatch } from '@/store/hooks';

import { completePortalSignIn } from './api';
import { sessionStarted } from './authSlice';

/**
 * Finishes sign-in from the MoH portal. The API has already checked the
 * Keycloak identity and the account link; this page claims the session and
 * replaces any session already in this browser, since the portal user is the
 * one at the keyboard.
 */
export default function PortalSignInPage() {
  const http = useHttp();
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();
  const router = useRouter();
  const { mutate } = useMutation({
    mutationFn: () => completePortalSignIn(http),
    onSuccess: (session) => {
      // Cached responses belong to whoever was signed in before.
      queryClient.clear();
      dispatch(sessionStarted(session));
      router.replace(HOME_PATH);
    },
    onError: () => {
      router.replace(
        `${SIGN_IN_PATH}?${new URLSearchParams({ [SSO_ERROR_PARAM]: 'expired' }).toString()}`,
      );
    },
    meta: { handlesOwnErrors: true },
  });
  // The claim works once, so it must not repeat when React re-runs effects.
  const claimed = useRef(false);
  useEffect(() => {
    if (claimed.current) return;
    claimed.current = true;
    mutate();
  }, [mutate]);

  return <PageLoader />;
}
