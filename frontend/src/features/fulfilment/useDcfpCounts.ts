import type { NavCounts } from '@/navigation/navigation';

import { useDistrictStore, useOrders, useRequests } from './queries';
import { dcfpCounts } from './tasks';

/**
 * The DCFP workspace's sidebar and tab badges. Reads nothing while `enabled`
 * is false, so other workspaces never ask for fulfilment data.
 */
export function useDcfpCounts(enabled: boolean): NavCounts | undefined {
  const orders = useOrders({ enabled });
  const requests = useRequests({ enabled });
  const store = useDistrictStore({ enabled });
  if (!enabled) return undefined;
  return dcfpCounts(orders.data, requests.data, store.data?.stock);
}
