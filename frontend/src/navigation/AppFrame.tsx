'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import { AppShell } from '@/components/layout/AppShell';
import { DistrictContextProvider } from '@/features/district/DistrictContext';
import { useDcfpCounts } from '@/features/fulfilment/useDcfpCounts';
import { useWarehouseCounts } from '@/features/warehouse/useWarehouseCounts';
import { useAppStorage } from '@/lib/storage/StorageProvider';

import { RequireAuth } from './guards';
import { workspaces } from './workspaces';

interface AppFrameProps {
  children: ReactNode;
}

/** Everything a signed-in screen sits inside: the guard, then the shell. */
export function AppFrame({ children }: AppFrameProps) {
  return (
    <RequireAuth>
      <SignedInShell>{children}</SignedInShell>
    </RequireAuth>
  );
}

/**
 * The shell with its badge counts. It sits inside the guard so the counts
 * are only fetched for a signed-in user. Each workspace's counts are read
 * only while that workspace is open. No notifications yet: they have no source.
 */
function SignedInShell({ children }: AppFrameProps) {
  const storage = useAppStorage();
  const pathname = usePathname();
  const dcfpCounts = useDcfpCounts(pathname === '/dcfp' || pathname.startsWith('/dcfp/'));
  const warehouseCounts = useWarehouseCounts(
    pathname === '/warehouse' || pathname.startsWith('/warehouse/'),
  );
  return (
    <AppShell workspaces={workspaces} storage={storage} counts={dcfpCounts ?? warehouseCounts}>
      <DistrictContextProvider>{children}</DistrictContextProvider>
    </AppShell>
  );
}
