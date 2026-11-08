import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import type { DeviceInfo } from '@/shared-contracts/common-fields.contract';

const INSTALLATION_ID_KEY = 'device.installationId';

let cachedInstallationId: string | null = null;

/**
 * Random id created once per app install. The API ties sessions and push
 * tokens to it, so one install has one logged-in account at a time.
 */
async function getInstallationId(): Promise<string> {
  if (cachedInstallationId) return cachedInstallationId;
  let id = await SecureStore.getItemAsync(INSTALLATION_ID_KEY);
  if (!id) {
    id = Crypto.randomUUID();
    await SecureStore.setItemAsync(INSTALLATION_ID_KEY, id);
  }
  cachedInstallationId = id;
  return id;
}

/** Sent with every login/signup request. */
export async function getDeviceInfo(): Promise<DeviceInfo> {
  return {
    installationId: await getInstallationId(),
    platform: Platform.OS === 'ios' ? 'IOS' : Platform.OS === 'web' ? 'WEB' : 'ANDROID',
    appVersion: Constants.expoConfig?.version,
  };
}
