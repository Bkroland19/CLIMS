import { useAllHotspots } from '@/features/hotspots/queries';
import type { NavCounts } from '@/navigation/navigation';

import { useOrders, useStock } from './queries';
import { dcfpCounts } from './tasks';

/**
 * The DCFP workspace's sidebar and tab badges, from the live API. Reads
 * nothing while `enabled` is false, so other workspaces never ask for
 * district data.
 */
export function useDcfpCounts(enabled: boolean): NavCounts | undefined {
  const queued = useOrders('queued', { enabled });
  const onHold = useOrders('on_hold', { enabled });
  const dispatched = useOrders('dispatched', { enabled });
  const stock = useStock({ enabled });
  const submitted = useAllHotspots({ review_status: 'submitted' }, { enabled });
  if (!enabled) return undefined;
  return dcfpCounts({
    queued: queued.data?.items,
    onHold: onHold.data?.items,
    dispatched: dispatched.data?.items,
    stock: stock.data,
    submitted: submitted.data?.items,
  });
}
