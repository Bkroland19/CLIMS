import type { InboxNotification } from '@/features/notifications/api';
import { unreadOfType } from '@/features/notifications/feed';
import type { NavCounts } from '@/navigation/navigation';

import { dcfpCounts } from './orders';
import { useOrders } from './queries';

/**
 * The DCFP workspace's sidebar and tab badges: stock to receive, and unread stockout
 * notifications from the inbox the bell already reads. Reads nothing while `enabled` is false.
 */
export function useDcfpCounts(
  enabled: boolean,
  inbox: readonly InboxNotification[] | undefined,
): NavCounts | undefined {
  const orders = useOrders({ enabled });
  if (!enabled) return undefined;
  return dcfpCounts(orders.data, inbox && unreadOfType(inbox, 'order.stockout_reported'));
}
