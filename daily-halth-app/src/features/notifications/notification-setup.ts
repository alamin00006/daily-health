import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { toBanglaDigits } from '@/lib/bangla-digits';
import { colors } from '@/theme/design-tokens';

/** Android channel for the local dose alarms (loudest, shows on the lock screen). */
export const DOSE_ALARM_CHANNEL = 'dose-alarms';
/** Android channel the server's pushes use (see the API's ANDROID_REMINDER_CHANNEL). */
export const SERVER_REMINDER_CHANNEL = 'reminders';
/** Buttons on a dose alarm. */
export const DOSE_CATEGORY = 'dose';
export const DOSE_ACTION_TAKEN = 'TAKEN';
export const DOSE_ACTION_SNOOZE = 'SNOOZE';
export const SNOOZE_MINUTES = 10;

/** Show alarms and pushes even while the app is open. */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

let prepared: Promise<void> | null = null;

/** Channels and alarm buttons; safe to call many times. */
export function prepareNotifications(): Promise<void> {
  prepared ??= (async () => {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(DOSE_ALARM_CHANNEL, {
        name: 'ওষুধের অ্যালার্ম',
        description: 'ওষুধ খাওয়ার সময় হলে বাজবে',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 400, 250, 400, 250, 400],
        lightColor: colors.primary,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      });
      await Notifications.setNotificationChannelAsync(SERVER_REMINDER_CHANNEL, {
        name: 'রিমাইন্ডার ও সতর্কতা',
        description: 'পরিবারের কারো ওষুধ বাকি, ওষুধ ফুরিয়ে আসা ইত্যাদি',
        importance: Notifications.AndroidImportance.HIGH,
        lightColor: colors.primary,
      });
    }
    await Notifications.setNotificationCategoryAsync(DOSE_CATEGORY, [
      {
        identifier: DOSE_ACTION_TAKEN,
        buttonTitle: 'সেবন করেছি',
        options: { opensAppToForeground: true },
      },
      {
        identifier: DOSE_ACTION_SNOOZE,
        buttonTitle: `${toBanglaDigits(SNOOZE_MINUTES)} মিনিট পরে`,
        options: { opensAppToForeground: true },
      },
    ]);
  })().catch((error: unknown) => {
    prepared = null;
    throw error;
  });
  return prepared;
}

/** Asks once; afterwards the user has to allow it in the phone's settings. */
export async function ensureNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const asked = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowSound: true, allowBadge: false },
  });
  return asked.granted;
}

export async function hasNotificationPermission(): Promise<boolean> {
  return (await Notifications.getPermissionsAsync()).granted;
}
