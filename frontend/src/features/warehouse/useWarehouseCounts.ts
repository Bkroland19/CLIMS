'use client';

import type { NavCounts } from '@/navigation/navigation';

import { useCurrentWarehouse, useStoreOrders } from './orderQueries';
import { warehouseCounts } from './requests';

/**
 * The warehouse workspace's sidebar badge, for the store being shown: orders waiting for a
 * decision or a dispatch. Reads nothing while `enabled` is false, so other workspaces never ask.
 */
export function useWarehouseCounts(enabled: boolean): NavCounts | undefined {
  const { warehouse } = useCurrentWarehouse({ enabled });
  const orders = useStoreOrders(warehouse?.id, { enabled });
  if (!enabled) return undefined;
  return warehouseCounts(orders.data);
}
