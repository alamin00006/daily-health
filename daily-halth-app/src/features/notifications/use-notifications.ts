import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { notificationsEndpoints } from '@/api/notifications-endpoints';
import { queryKeys } from '@/api/query-keys';
import type { UpdateNotificationPreferencesRequest } from '@/shared-contracts/notifications.contract';
import { useSessionStore } from '@/stores/session-store';

function useIsRegistered(): boolean {
  return useSessionStore((s) => s.status === 'signedIn' && !s.user?.isGuest);
}

export function useInbox() {
  const enabled = useIsRegistered();
  return useInfiniteQuery({
    queryKey: queryKeys.inbox,
    queryFn: ({ pageParam }) => notificationsEndpoints.inbox(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => (page.meta.hasMore ? (page.meta.cursor ?? undefined) : undefined),
    enabled,
  });
}

/** Bell badge. Checked every minute while the app is open. */
export function useUnreadCount() {
  const enabled = useIsRegistered();
  return useQuery({
    queryKey: queryKeys.unreadCount,
    queryFn: async () => (await notificationsEndpoints.unreadCount()).unread,
    enabled,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

export function useMarkNotificationsRead() {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['notifications'] });
  const one = useMutation({
    mutationFn: (notificationId: string) => notificationsEndpoints.markRead(notificationId),
    onSuccess: refresh,
  });
  const all = useMutation({
    mutationFn: () => notificationsEndpoints.markAllRead(),
    onSuccess: refresh,
  });
  return { one, all };
}

export function useNotificationPreferences() {
  const enabled = useIsRegistered();
  return useQuery({
    queryKey: queryKeys.notificationPreferences,
    queryFn: () => notificationsEndpoints.preferences(),
    enabled,
    staleTime: 10 * 60_000,
  });
}

export function useUpdateNotificationPreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateNotificationPreferencesRequest) =>
      notificationsEndpoints.updatePreferences(body),
    onSuccess: (preferences) =>
      queryClient.setQueryData(queryKeys.notificationPreferences, preferences),
  });
}
