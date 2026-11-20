import { z } from 'zod';

import { readJson, removeKey, writeJson, type StorageLike } from '@/lib/storage/jsonStorage';
import { ONBOARDING_PATH } from '@/navigation/paths';

/*
 * Where a visitor is in activating their invitation. The step is in the URL,
 * so a refresh or the browser's Back button lands on the same step; what the
 * earlier steps produced (the verified phone and the activation token) is kept
 * in storage, so the step can still be completed after a refresh. The password
 * is never stored: the server holds it once the password step is done.
 */

export const STEPS = ['phone', 'code', 'password', 'details'] as const;
export type OnboardingStep = (typeof STEPS)[number];
export const stepSchema = z.enum(STEPS);

const progressSchema = z.object({
  invite: z.string(),
  /** E.164, as the SMS was sent to it. */
  phone: z.string(),
  /** When the latest code was sent, in epoch milliseconds. */
  code_sent_at: z.number(),
  resend_after_seconds: z.number().int().nonnegative(),
  /** Set once the code is verified. */
  activation_token: z.string().nullable(),
  password_set: z.boolean(),
});

export type OnboardingProgress = z.infer<typeof progressSchema>;

const STORAGE_KEY = 'clims.onboarding';

/** The saved progress for `invite`, or `null` when there is none (or it is for another invitation). */
export function readProgress(storage: StorageLike, invite: string): OnboardingProgress | null {
  const progress = readJson(storage, STORAGE_KEY, (value) => {
    const result = progressSchema.safeParse(value);
    return result.success ? result.data : null;
  });
  return progress?.invite === invite ? progress : null;
}

export function writeProgress(storage: StorageLike, progress: OnboardingProgress): void {
  writeJson(storage, STORAGE_KEY, progress);
}

export function clearProgress(storage: StorageLike): void {
  removeKey(storage, STORAGE_KEY);
}

/** The furthest step `progress` lets the visitor open. */
export function furthestStep(progress: OnboardingProgress | null): OnboardingStep {
  if (!progress) return 'phone';
  if (!progress.activation_token) return 'code';
  if (!progress.password_set) return 'password';
  return 'details';
}

/** The step to show for the one asked for in the URL: it, unless an earlier step is unfinished. */
export function reachableStep(
  requested: OnboardingStep,
  progress: OnboardingProgress | null,
): OnboardingStep {
  const furthest = furthestStep(progress);
  return STEPS.indexOf(requested) <= STEPS.indexOf(furthest) ? requested : furthest;
}

/** The address of `step` of the invitation `invite`. */
export function onboardingHref(invite: string, step: OnboardingStep): string {
  return `${ONBOARDING_PATH}?${new URLSearchParams({ invite, step }).toString()}`;
}

/** Whole seconds until another code may be requested, never below zero. */
export function secondsUntilResend(progress: OnboardingProgress, now: number): number {
  const opensAt = progress.code_sent_at + progress.resend_after_seconds * 1000;
  return Math.max(0, Math.ceil((opensAt - now) / 1000));
}
