import { useMemo } from 'react';

import type { AppNotification, NotificationActions } from '@/components/layout/NotificationsBell';
import { formatTimestamp } from '@/lib/format';

import type { InboxNotification } from './api';
import { toAppNotification } from './feed';
import { useInbox, useMarkAllRead, useMarkRead } from './queries';

export interface NotificationFeed {
  /** The raw inbox, for badges that count a type; undefined until it loads. */
  inbox: readonly InboxNotification[] | undefined;
  /** The bell's list; undefined while the inbox cannot be read, which the bell says. */
  notifications: readonly AppNotification[] | undefined;
  actions: NotificationActions;
}

/**
 * The signed-in user's inbox for the top bar's bell. Opening an unread notification marks it
 * read. `canOpenDcfp` decides whether DCFP notifications link to their screens.
 */
export function useNotificationFeed(canOpenDcfp: boolean): NotificationFeed {
  const inbox = useInbox();
  const markRead = useMarkRead();
  const markAllRead = useMarkAllRead();
  const { mutate: read } = markRead;
  const { mutate: readAll } = markAllRead;

  const notifications = useMemo(
    () =>
      inbox.data?.map((notification) =>
        toAppNotification(notification, canOpenDcfp, (iso) => formatTimestamp(iso)),
      ),
    [inbox.data, canOpenDcfp],
  );
  const actions = useMemo<NotificationActions>(
    () => ({
      onOpen: (notification) => {
        if (notification.unread !== false) read(notification.id);
      },
      onMarkAllRead: () => {
        readAll();
      },
    }),
    [read, readAll],
  );
  return { inbox: inbox.data, notifications, actions };
}
