import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useApiQuery, useHttp } from '@/lib/api';

import { listNotifications, markAllNotificationsRead, markNotificationRead } from './api';

const ROOT = 'notifications';
export const notificationKeys = { inbox: [ROOT, 'inbox'] as const };

/** The docs suggest checking every 30 to 60 seconds; a minute keeps the load low. */
const POLL_MS = 60_000;

/** The newest notifications, checked again every minute while the app is open. */
export function useInbox(options: { enabled?: boolean } = {}) {
  return useApiQuery(notificationKeys.inbox, listNotifications, {
    ...options,
    refetchInterval: POLL_MS,
  });
}

function useInvalidateInbox() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: notificationKeys.inbox });
}

export function useMarkRead() {
  const http = useHttp();
  const invalidate = useInvalidateInbox();
  return useMutation({
    mutationFn: (id: string) => markNotificationRead(http, id),
    onSettled: invalidate,
  });
}

export function useMarkAllRead() {
  const http = useHttp();
  const invalidate = useInvalidateInbox();
  return useMutation({
    mutationFn: () => markAllNotificationsRead(http),
    onSettled: invalidate,
  });
}
