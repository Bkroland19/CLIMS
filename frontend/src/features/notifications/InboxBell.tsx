'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import { NotificationsBell, type AppNotification } from '@/components/layout/NotificationsBell';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { districtKeys } from '@/features/district/queries';
import { hotspotKeys } from '@/features/hotspots/queries';
import { formatTimestamp } from '@/lib/format';

import type { Notification } from './api';
import { notificationHref, notificationTone, type InboxWorkspace } from './display';
import {
  notificationKeys,
  UNREAD_POLL_MS,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useUnreadCount,
} from './queries';

interface InboxBellProps {
  /** The web workspaces the user can open, so a notification only links to a page they can see. */
  canOpen: (workspace: InboxWorkspace) => boolean;
}

const toEntry = (
  notification: Notification,
  canOpen: InboxBellProps['canOpen'],
): AppNotification => ({
  id: notification.id,
  text: notification.title,
  detail: notification.body,
  meta: formatTimestamp(notification.created_at),
  tone: notificationTone(notification.type),
  unread: notification.read_at === null,
  href: notificationHref(notification, canOpen),
});

/**
 * Refreshes the district's orders, stock and hotspots when the unread count
 * rises, so the sidebar badges and an open list show what the new
 * notification is about, and an open bell lists it, without waiting for their own refresh. Only queries
 * on screen refetch; the rest are marked stale.
 */
function useRefreshOnNewNotifications(count: number | undefined) {
  const queryClient = useQueryClient();
  const previous = useRef(count);
  useEffect(() => {
    const before = previous.current;
    previous.current = count;
    if (before === undefined || count === undefined || count <= before) return;
    void queryClient.invalidateQueries({ queryKey: districtKeys.all });
    void queryClient.invalidateQueries({ queryKey: hotspotKeys.all });
    void queryClient.invalidateQueries({ queryKey: [...notificationKeys.all, 'list'] });
  }, [count, queryClient]);
}

/**
 * The top bar's bell on the signed-in user's inbox (`/notifications`), for
 * every role. The unread count is polled, as the API has no push; the list
 * loads, fresh, each time the bell is opened, and a rise in the count
 * refreshes the district's data. Opening a notification marks it
 * read, and "Mark all read" clears the rest.
 */
export function InboxBell({ canOpen }: InboxBellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const unread = useUnreadCount({ refetchInterval: UNREAD_POLL_MS });
  const list = useNotifications(false, { enabled: isOpen, staleTime: 0 });
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const count = unread.data ?? 0;
  useRefreshOnNewNotifications(unread.data);

  return (
    <NotificationsBell
      notifications={list.data?.map((notification) => toEntry(notification, canOpen))}
      unreadCount={count}
      // A retry after a failure shows the placeholders again rather than the old error.
      isLoading={list.isPending || (list.isError && list.isFetching)}
      error={list.error}
      onRetry={() => void list.refetch()}
      onOpenNotification={(entry) => {
        if (entry.unread) markRead.mutate(entry.id);
      }}
      action={
        count > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              markAllRead.mutate();
            }}
            disabled={markAllRead.isPending}
          >
            {markAllRead.isPending ? <Spinner data-icon="inline-start" aria-hidden="true" /> : null}
            {markAllRead.isPending ? 'Marking…' : 'Mark all read'}
          </Button>
        ) : undefined
      }
      onOpenChange={setIsOpen}
    />
  );
}
