'use client';

import { createContext, useContext, useMemo } from 'react';

import { useCurrentUser } from '@/features/auth/hooks';
import type { WarehouseCode } from '@/features/fulfilment/api';

import { allowedWarehouse, homeWorkspace, webAccessFor, type WebAccess } from './access';
import { workspaces } from './workspaces';

/** What the signed-in person may open on the web, worked out from their roles. */
export function useWebAccess(): WebAccess {
  const roleNames = useCurrentUser()?.roleNames ?? null;
  return useMemo(() => webAccessFor(roleNames), [roleNames]);
}

/** Where the signed-in person's own work starts, or null when no workspace is theirs. */
export function useHomeWorkspace() {
  const access = useWebAccess();
  const id = homeWorkspace(access);
  return workspaces.find((workspace) => workspace.id === id) ?? null;
}

/** The warehouse to show for `requested`: it, when theirs to see, else the one they work in. */
export function useAllowedWarehouse(requested: WarehouseCode): WarehouseCode {
  return allowedWarehouse(useWebAccess(), requested) ?? requested;
}

const ReadOnlyContext = createContext(false);

/** Set by the shell around a workspace the person may look at but not act in. */
export const ReadOnlyProvider = ReadOnlyContext.Provider;

/**
 * True inside a workspace opened read-only, e.g. MOH looking at the DCFP
 * screens. Page and row actions hide themselves; a page with its own action
 * buttons checks this too. Outside the shell (in tests of one page) it is false.
 */
export function useReadOnly(): boolean {
  return useContext(ReadOnlyContext);
}
