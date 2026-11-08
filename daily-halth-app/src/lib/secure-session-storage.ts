import * as SecureStore from 'expo-secure-store';

import type { AuthUserSummary } from '@/shared-contracts/auth.contract';

/**
 * Login data kept in the OS keychain/keystore (expo-secure-store, CLAUDE.md §2).
 * The access token is never stored: it lives in memory and is re-issued from
 * the refresh token on app start.
 */
const REFRESH_TOKEN_KEY = 'session.refreshToken';
const USER_KEY = 'session.user';

const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

export interface StoredSession {
  refreshToken: string;
  user: AuthUserSummary;
}

export async function readStoredSession(): Promise<StoredSession | null> {
  const [refreshToken, userJson] = await Promise.all([
    SecureStore.getItemAsync(REFRESH_TOKEN_KEY, OPTIONS),
    SecureStore.getItemAsync(USER_KEY, OPTIONS),
  ]);
  if (!refreshToken || !userJson) return null;
  try {
    return { refreshToken, user: JSON.parse(userJson) as AuthUserSummary };
  } catch {
    return null;
  }
}

export async function writeStoredSession(session: StoredSession): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(REFRESH_TOKEN_KEY, session.refreshToken, OPTIONS),
    SecureStore.setItemAsync(USER_KEY, JSON.stringify(session.user), OPTIONS),
  ]);
}

export async function clearStoredSession(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY, OPTIONS),
    SecureStore.deleteItemAsync(USER_KEY, OPTIONS),
  ]);
}
