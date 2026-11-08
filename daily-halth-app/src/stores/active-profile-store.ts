import { create } from 'zustand';

import { readJson, removeKey, writeJson } from '@/lib/local-key-value-store';

const STORAGE_KEY = 'active-profile-id';

interface ActiveProfileState {
  /** Whose health the app is showing (own, father, child…). null = own profile / first. */
  activeProfileId: string | null;
  loaded: boolean;
  load(): Promise<void>;
  setActiveProfile(profileId: string): void;
  clear(): void;
}

/**
 * The family member currently shown on every tab. Kept across restarts so a
 * daughter who looks after her father opens straight onto his profile.
 */
export const useActiveProfileStore = create<ActiveProfileState>()((set) => ({
  activeProfileId: null,
  loaded: false,
  async load() {
    const stored = await readJson<string>(STORAGE_KEY);
    set({ activeProfileId: stored, loaded: true });
  },
  setActiveProfile(profileId) {
    set({ activeProfileId: profileId });
    void writeJson(STORAGE_KEY, profileId);
  },
  clear() {
    set({ activeProfileId: null });
    void removeKey(STORAGE_KEY);
  },
}));
