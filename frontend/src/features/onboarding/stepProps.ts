import type { OnboardingProgress, OnboardingStep } from './progress';

/** What every onboarding step receives from the screen that sequences them. */
export interface StepProps {
  /** The invitation token from the link. */
  token: string;
  /** What the earlier steps produced, or `null` before the code is sent. */
  progress: OnboardingProgress | null;
  /** Saves new progress (to storage, so a refresh keeps it). */
  onProgress: (progress: OnboardingProgress) => void;
  /** Moves to another step, as a new history entry. */
  goTo: (step: OnboardingStep) => void;
}
