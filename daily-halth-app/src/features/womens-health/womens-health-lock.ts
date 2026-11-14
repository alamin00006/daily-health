import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { AppState } from 'react-native';
import { create } from 'zustand';

/**
 * The women's health section lock (CLAUDE.md §1): a 4-digit PIN that never
 * leaves the phone. Only a salted SHA-256 of it is kept, in the OS keystore
 * (expo-secure-store), one per profile. The server only knows the on/off flag.
 *
 * Forgetting the PIN: signing out clears it (clearWomensHealthLocks), and after
 * signing in again (account PIN + email OTP) a new one is set.
 */
const STORE_KEY = 'womens-health.lock';
const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};
export const LOCK_PIN_LENGTH = 4;
const MAX_ATTEMPTS = 5;
const COOL_DOWN_MS = 30_000;

type StoredLocks = Record<string, { salt: string; hash: string }>;

async function readLocks(): Promise<StoredLocks> {
  const raw = await SecureStore.getItemAsync(STORE_KEY, OPTIONS);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as StoredLocks;
  } catch {
    return {};
  }
}

async function writeLocks(locks: StoredLocks): Promise<void> {
  if (Object.keys(locks).length === 0) await SecureStore.deleteItemAsync(STORE_KEY, OPTIONS);
  else await SecureStore.setItemAsync(STORE_KEY, JSON.stringify(locks), OPTIONS);
}

function hashPin(salt: string, pin: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${pin}`);
}

export async function hasLockPin(profileId: string): Promise<boolean> {
  return Boolean((await readLocks())[profileId]);
}

export async function setLockPin(profileId: string, pin: string): Promise<void> {
  const salt = Array.from(Crypto.getRandomBytes(16), (b) => b.toString(16).padStart(2, '0')).join('');
  const locks = await readLocks();
  locks[profileId] = { salt, hash: await hashPin(salt, pin) };
  await writeLocks(locks);
}

export async function removeLockPin(profileId: string): Promise<void> {
  const locks = await readLocks();
  delete locks[profileId];
  await writeLocks(locks);
}

/** On sign-out: the next person to sign in on this phone sets their own. */
export async function clearWomensHealthLocks(): Promise<void> {
  await SecureStore.deleteItemAsync(STORE_KEY, OPTIONS);
  useWomensHealthLock.setState({ unlocked: {}, failures: 0, blockedUntil: 0 });
}

interface LockState {
  /** Profiles opened since the app last came to the foreground. */
  unlocked: Record<string, true>;
  failures: number;
  blockedUntil: number;
  markUnlocked(profileId: string): void;
  /** 'ok' | 'wrong' | 'blocked' (too many wrong tries; wait 30 s). */
  tryUnlock(profileId: string, pin: string): Promise<'ok' | 'wrong' | 'blocked'>;
}

export const useWomensHealthLock = create<LockState>((set, get) => ({
  unlocked: {},
  failures: 0,
  blockedUntil: 0,
  markUnlocked(profileId) {
    set((s) => ({ unlocked: { ...s.unlocked, [profileId]: true }, failures: 0 }));
  },
  async tryUnlock(profileId, pin) {
    if (Date.now() < get().blockedUntil) return 'blocked';
    const entry = (await readLocks())[profileId];
    if (!entry || (await hashPin(entry.salt, pin)) === entry.hash) {
      get().markUnlocked(profileId);
      return 'ok';
    }
    const failures = get().failures + 1;
    if (failures >= MAX_ATTEMPTS) {
      set({ failures: 0, blockedUntil: Date.now() + COOL_DOWN_MS });
      return 'blocked';
    }
    set({ failures });
    return 'wrong';
  },
}));

// Leaving the app locks the section again.
AppState.addEventListener('change', (state) => {
  if (state === 'background') useWomensHealthLock.setState({ unlocked: {} });
});
