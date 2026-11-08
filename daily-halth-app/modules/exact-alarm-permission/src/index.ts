import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

interface ExactAlarmPermissionNative {
  canScheduleExactAlarms(): boolean;
  openExactAlarmSettings(): void;
}

/** Missing on iOS (which has no such permission) and in builds made before this module. */
const native =
  Platform.OS === 'android'
    ? requireOptionalNativeModule<ExactAlarmPermissionNative>('ExactAlarmPermission')
    : null;

/** True when dose alarms can ring on the exact minute (always true off Android 12+). */
export function canScheduleExactAlarms(): boolean {
  return native ? native.canScheduleExactAlarms() : true;
}

/** Opens Android's "Alarms & reminders" switch for this app. */
export function openExactAlarmSettings(): void {
  native?.openExactAlarmSettings();
}
