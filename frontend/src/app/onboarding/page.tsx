import type { Metadata } from 'next';

import OnboardingPage from '@/features/onboarding/OnboardingPage';

export const metadata: Metadata = { title: 'Activate your account' };

/*
 * Public, like sign-in, and deliberately without a guard: an invitation link
 * must open for a signed-out visitor, and also on a shared computer where
 * someone else is still signed in.
 */
export default function Page() {
  return <OnboardingPage />;
}
