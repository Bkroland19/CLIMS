'use client';

import type { NavCounts } from '@/navigation/navigation';

import { useWarehouseRequests } from './queries';
import { warehouseCounts } from './tasks';
import { useWarehouseStore } from './useWarehouseStore';

/**
 * The warehouse workspace's sidebar badge, for the store being shown. Reads
 * nothing while `enabled` is false, so other workspaces never ask for it.
 */
export function useWarehouseCounts(enabled: boolean): NavCounts | undefined {
  const { store } = useWarehouseStore();
  const requests = useWarehouseRequests(store, { enabled });
  if (!enabled) return undefined;
  return warehouseCounts(requests.data);
}
