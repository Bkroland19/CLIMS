import type { Metadata } from 'next';

import PortalSignInPage from '@/features/auth/PortalSignInPage';

export const metadata: Metadata = { title: 'Signing in' };

/*
 * Public and without a guard: the API sends the browser here after portal
 * sign-in, whether or not someone is already signed in on this browser.
 */
export default function Page() {
  return <PortalSignInPage />;
}
