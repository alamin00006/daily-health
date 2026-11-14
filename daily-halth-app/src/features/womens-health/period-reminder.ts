import * as Notifications from 'expo-notifications';

import { SERVER_REMINDER_CHANNEL, prepareNotifications } from '@/features/notifications/notification-setup';
import { addDays, dhakaDate } from '@/lib/bangla-format';
import type { CycleOverviewResponse } from '@/shared-contracts/womens-health.contract';

/** Rings this many days before the predicted start, at 09:00 Dhaka time. */
const DAYS_BEFORE = 2;
const REMINDER_HOUR_UTC = 3; // 09:00 Asia/Dhaka

const identifier = (profileId: string) => `period-reminder-${profileId}`;

/**
 * One local reminder before the next predicted period (CLAUDE.md §4: sensitive
 * notifications carry no health details, so the text is generic). Re-planned
 * every time the overview loads, so it follows the latest prediction.
 */
export async function syncPeriodReminder(profileId: string, overview: CycleOverviewResponse): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(identifier(profileId)).catch(() => undefined);
  if (!overview.settings.remindersOn || overview.pregnancy || !overview.nextPeriodStart) return;

  const day = addDays(overview.nextPeriodStart, -DAYS_BEFORE);
  if (day <= dhakaDate()) return;
  const at = new Date(`${day}T${String(REMINDER_HOUR_UTC).padStart(2, '0')}:00:00.000Z`);

  const permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) return;
  await prepareNotifications();
  await Notifications.scheduleNotificationAsync({
    identifier: identifier(profileId),
    content: {
      title: 'দৈনিক স্বাস্থ্য',
      body: 'আপনার একটি রিমাইন্ডার আছে',
      data: { screen: 'womens-health', profileId },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: at,
      channelId: SERVER_REMINDER_CHANNEL,
    },
  });
}

export async function cancelPeriodReminder(profileId: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(identifier(profileId)).catch(() => undefined);
}
