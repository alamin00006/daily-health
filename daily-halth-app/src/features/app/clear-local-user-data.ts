import * as Notifications from 'expo-notifications';

import { clearDoseQueue } from '@/features/medicine/offline-dose-queue';
import { forgetSentPushToken } from '@/features/notifications/push-registration';
import { removeKey } from '@/lib/local-key-value-store';
import { useActiveProfileStore } from '@/stores/active-profile-store';

/**
 * On logout: nothing of this account may stay on the phone for the next one
 * (alarms naming a family member, queued doses, the selected profile).
 */
export async function clearLocalUserData(): Promise<void> {
  await Promise.allSettled([
    Notifications.cancelAllScheduledNotificationsAsync(),
    Notifications.dismissAllNotificationsAsync(),
    removeKey('dose-alarm-fingerprint'),
    clearDoseQueue(),
    forgetSentPushToken(),
  ]);
  useActiveProfileStore.getState().clear();
}
