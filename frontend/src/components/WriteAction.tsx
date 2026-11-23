import type { ReactNode } from 'react';

import { useReadOnly } from '@/navigation/useAccess';

interface WriteActionProps {
  /** A control that changes something: submit, confirm, dispatch, add. */
  children: ReactNode;
}

/**
 * Renders a control that changes data, except in a workspace opened read-only
 * (MOH looking at the DCFP or warehouse screens), where it is left out. The
 * shell's read-only notice says why. Exports and links stay outside it.
 */
export function WriteAction({ children }: WriteActionProps) {
  return useReadOnly() ? null : children;
}
