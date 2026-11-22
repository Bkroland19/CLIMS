import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useApiQuery, useHttp, type ApiQueryOptions } from '@/lib/api';

import {
  getUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from './api';

const ROOT = 'notifications';
export const notificationKeys = {
  all: [ROOT] as const,
  list: (unread: boolean) => [ROOT, 'list', unread] as const,
  unreadCount: [ROOT, 'unread-count'] as const,
};

/** How often the badge asks for the unread count; the API has no push, and it suggests 30–60 s. */
export const UNREAD_POLL_MS = 60_000;

export function useNotifications(unread = false, options: ApiQueryOptions = {}) {
  return useApiQuery(
    notificationKeys.list(unread),
    (http, signal) => listNotifications(http, { unread }, signal),
    options,
  );
}

export function useUnreadCount(options: ApiQueryOptions = {}) {
  return useApiQuery(notificationKeys.unreadCount, getUnreadCount, options);
}

function useInvalidateNotifications() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: notificationKeys.all });
}

export function useMarkNotificationRead() {
  const http = useHttp();
  const invalidate = useInvalidateNotifications();
  return useMutation({
    mutationFn: (id: string) => markNotificationRead(http, id),
    onSuccess: invalidate,
  });
}

export function useMarkAllNotificationsRead() {
  const http = useHttp();
  const invalidate = useInvalidateNotifications();
  return useMutation({
    mutationFn: () => markAllNotificationsRead(http),
    onSuccess: invalidate,
  });
}
