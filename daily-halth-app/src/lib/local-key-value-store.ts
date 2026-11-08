import Storage from 'expo-sqlite/kv-store';

/**
 * Small non-secret app state that must survive restarts (expo-sqlite,
 * CLAUDE.md §2): the selected family profile, the offline dose queue, the
 * alarm schedule fingerprint. Secrets go to expo-secure-store instead.
 */
export async function readJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await Storage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function writeJson(key: string, value: unknown): Promise<void> {
  await Storage.setItem(key, JSON.stringify(value));
}

export async function removeKey(key: string): Promise<void> {
  await Storage.removeItem(key);
}
