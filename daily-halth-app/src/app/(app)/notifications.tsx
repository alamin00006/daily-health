import { router } from 'expo-router';
import { Bell, CheckCheck, Pill, TriangleAlert } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { ActionButton } from '@/components/ui/action-button';
import { BanglaText } from '@/components/ui/bangla-text';
import { IconBadge } from '@/components/ui/icon-badge';
import { IconButton, ScreenHeader } from '@/components/ui/screen-header';
import { ScrollScreen } from '@/components/ui/scroll-screen';
import { EmptyState, ErrorState, LoadingList } from '@/components/ui/state-views';
import { useInbox, useMarkNotificationsRead } from '@/features/notifications/use-notifications';
import { timeAgo } from '@/lib/bangla-format';
import type { NotificationResponse } from '@/shared-contracts/notifications.contract';
import { useActiveProfileStore } from '@/stores/active-profile-store';

function iconFor(type: string) {
  if (type === 'dose.missed') return { icon: TriangleAlert, tone: 'danger' as const };
  if (type.startsWith('medicine')) return { icon: Pill, tone: 'primary' as const };
  return { icon: Bell, tone: 'neutral' as const };
}

export default function NotificationsScreen() {
  const inbox = useInbox();
  const { one, all } = useMarkNotificationsRead();
  const setActiveProfile = useActiveProfileStore((s) => s.setActiveProfile);
  const items = inbox.data?.pages.flatMap((page) => page.data) ?? [];
  const unread = items.filter((n) => !n.readAt).length;

  const open = (notification: NotificationResponse) => {
    if (!notification.readAt) one.mutate(notification.id);
    const data = notification.data as { screen?: string; profileId?: string } | null;
    if (data?.profileId) setActiveProfile(data.profileId);
    if (data?.screen === 'medicine') router.push('/medicine');
  };

  return (
    <ScrollScreen
      header={
        <ScreenHeader
          title="বার্তা"
          fallbackHref="/home"
          actions={
            unread > 0 ? (
              <IconButton icon={CheckCheck} label="সব পড়া হয়েছে" onPress={() => all.mutate()} />
            ) : undefined
          }
        />
      }
      onRefresh={() => inbox.refetch()}>
      {inbox.isLoading ? (
        <LoadingList rows={5} rowClassName="h-20" />
      ) : inbox.isError ? (
        <ErrorState error={inbox.error} onRetry={() => void inbox.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="কোনো বার্তা নেই"
          message="পরিবারের কারো ওষুধ বাদ পড়লে বা ওষুধ ফুরিয়ে এলে এখানে জানানো হবে।"
        />
      ) : (
        <View className="gap-2.5">
          {items.map((notification) => {
            const { icon, tone } = iconFor(notification.type);
            const isUnread = !notification.readAt;
            return (
              <Pressable
                key={notification.id}
                accessibilityRole="button"
                accessibilityLabel={`${isUnread ? 'না পড়া: ' : ''}${notification.title}`}
                onPress={() => open(notification)}
                className={`flex-row gap-3 rounded-3xl border p-4 active:opacity-80 ${
                  isUnread ? 'border-primary-200 bg-primary-50' : 'border-line/70 bg-surface-card'
                }`}>
                <IconBadge icon={icon} tone={tone} size="sm" />
                <View className="flex-1 gap-0.5">
                  <View className="flex-row items-start justify-between gap-2">
                    <BanglaText variant="body-strong" className="flex-1">
                      {notification.title}
                    </BanglaText>
                    {isUnread ? (
                      <View className="mt-2 h-2.5 w-2.5 rounded-full bg-primary" />
                    ) : null}
                  </View>
                  <BanglaText variant="label" className="font-bangla text-ink-muted">
                    {notification.body}
                  </BanglaText>
                  <BanglaText variant="caption" className="text-ink-subtle">
                    {timeAgo(notification.createdAt)}
                  </BanglaText>
                </View>
              </Pressable>
            );
          })}
          {inbox.hasNextPage ? (
            <ActionButton
              label="আরও দেখুন"
              variant="ghost"
              size="sm"
              loading={inbox.isFetchingNextPage}
              onPress={() => void inbox.fetchNextPage()}
            />
          ) : null}
        </View>
      )}
    </ScrollScreen>
  );
}
