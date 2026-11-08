import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';

import { notificationsEndpoints } from '@/api/notifications-endpoints';
import { readJson, writeJson } from '@/lib/local-key-value-store';

const SENT_TOKEN_KEY = 'push-token-sent';

function easProjectId(): string | null {
  const fromConfig = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)
    ?.eas?.projectId;
  return fromConfig ?? Constants.easConfig?.projectId ?? null;
}

/**
 * Sends this phone's Expo push token to the API (missed-dose alerts for
 * family, refill alerts). Needs an EAS project id and, on Android, Firebase
 * (google-services.json). Without them the app works fully except server
 * pushes: dose alarms are local anyway. Never throws.
 */
export async function registerPushToken(): Promise<
  'sent' | 'unchanged' | 'unavailable' | 'no-permission'
> {
  try {
    if (!Device.isDevice && !__DEV__) return 'unavailable';
    const permission = await Notifications.getPermissionsAsync();
    if (!permission.granted) {
      if ((await readJson<string>(SENT_TOKEN_KEY)) !== null) {
        await notificationsEndpoints.updatePushToken(null);
        await writeJson(SENT_TOKEN_KEY, null);
      }
      return 'no-permission';
    }
    const projectId = easProjectId();
    if (!projectId) return 'unavailable';

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    if ((await readJson<string>(SENT_TOKEN_KEY)) === token) return 'unchanged';
    await notificationsEndpoints.updatePushToken(token);
    await writeJson(SENT_TOKEN_KEY, token);
    return 'sent';
  } catch {
    // No Firebase config, no Play services, offline: try again next start.
    return 'unavailable';
  }
}

/** A new login on this phone must send the token again. */
export async function forgetSentPushToken(): Promise<void> {
  await writeJson(SENT_TOKEN_KEY, null);
}
