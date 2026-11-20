import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useApiQuery, useHttp } from '@/lib/api';

import {
  activate,
  getInvitation,
  sendCode,
  setPassword,
  verifyCode,
  type ActivateInput,
  type SendCodeInput,
  type SetPasswordInput,
  type VerifyCodeInput,
} from './api';

/*
 * NOT YET IN THE GO API: see the note at the top of ./api.ts.
 *
 * Every step shows its own failure next to its fields, so each mutation
 * handles its own errors rather than raising the app-wide toast.
 */

export const onboardingKeys = {
  invitation: (token: string) => ['onboarding', 'invitation', token] as const,
};

export function useInvitation(token: string) {
  return useApiQuery(onboardingKeys.invitation(token), (http, signal) =>
    getInvitation(http, token, signal),
  );
}

export function useSendCode(token: string) {
  const http = useHttp();
  return useMutation({
    mutationFn: (input: SendCodeInput) => sendCode(http, token, input),
    meta: { handlesOwnErrors: true },
  });
}

export function useVerifyCode(token: string) {
  const http = useHttp();
  return useMutation({
    mutationFn: (input: VerifyCodeInput) => verifyCode(http, token, input),
    meta: { handlesOwnErrors: true },
  });
}

export function useSetPassword(token: string) {
  const http = useHttp();
  return useMutation({
    mutationFn: (input: SetPasswordInput) => setPassword(http, token, input),
    meta: { handlesOwnErrors: true },
  });
}

export function useActivate(token: string) {
  const http = useHttp();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ActivateInput) => activate(http, token, input),
    onSuccess: async () => {
      // The invitation is used up now; a later visit must see that, not the cached
      // copy. Not refetched here: this screen is about to leave for sign-in.
      await queryClient.invalidateQueries({
        queryKey: onboardingKeys.invitation(token),
        refetchType: 'none',
      });
    },
    meta: { handlesOwnErrors: true },
  });
}
