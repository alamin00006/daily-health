import { useQuery } from '@tanstack/react-query';
import Storage from 'expo-sqlite/kv-store';
import { vars } from 'nativewind';
import { useEffect, useMemo, type ReactNode } from 'react';
import { View } from 'react-native';
import { create } from 'zustand';

import { apiRequest } from '@/api/http-client';
import {
  DEFAULT_PRIMARY_COLOR,
  hexColorSchema,
  primaryPalette,
  type AppConfigResponse,
  type PrimaryPalette,
} from '@/shared-contracts/app-config.contract';

import { colors, shadows } from './design-tokens';

const CACHE_KEY = 'app-theme.primary';
/**
 * A colour fetched this soon after the app first shows is applied at once; later,
 * at the next launch. Counted from the first render (not module load), so a slow
 * start-up does not use up the window.
 */
const APPLY_LIVE_WITHIN_MS = 15_000;
let shownAt: number | null = null;

function readCachedPrimary(): string {
  try {
    const raw = Storage.getItemSync(CACHE_KEY);
    const parsed = hexColorSchema.safeParse(raw);
    return parsed.success ? parsed.data : DEFAULT_PRIMARY_COLOR;
  } catch {
    return DEFAULT_PRIMARY_COLOR;
  }
}

function channels(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

/** Replaces the primary entries of the JS tokens (icons, native props, shadows). */
function applyToTokens(palette: PrimaryPalette): void {
  colors.primary = palette['600'];
  colors.primary50 = palette['50'];
  colors.primary100 = palette['100'];
  colors.primary300 = palette['300'];
  colors.primary700 = palette['700'];
  const [r, g, b] = channels(palette['600']).split(' ');
  shadows.button = { boxShadow: `0 4px 12px rgba(${r}, ${g}, ${b}, 0.25)` };
}

interface ThemeState {
  primary: string;
  setPrimary: (primary: string) => void;
}

/** The primary colour in use. Starts from the last one the API gave (read before the first render). */
export const useThemeStore = create<ThemeState>()((set) => {
  const primary = readCachedPrimary();
  applyToTokens(primaryPalette(primary));
  return {
    primary,
    setPrimary: (next) => {
      applyToTokens(primaryPalette(next));
      set({ primary: next });
    },
  };
});

/**
 * Wraps the app: sets the primary CSS variables (for className colours) and remounts
 * the tree when the colour changes (for the JS tokens). Fetches the admin-set colour,
 * caches it, and applies it now if the app has just opened, otherwise at the next launch
 * (so the screen never repaints under someone's finger).
 */
export function ThemeRoot({ children }: { children: ReactNode }) {
  const primary = useThemeStore((s) => s.primary);
  const setPrimary = useThemeStore((s) => s.setPrimary);
  const config = useQuery({
    queryKey: ['app-config'],
    queryFn: () => apiRequest<AppConfigResponse>('/app-config'),
    staleTime: 30 * 60_000,
    retry: 1,
  });

  useEffect(() => {
    shownAt ??= Date.now();
  }, []);

  useEffect(() => {
    const fetched = config.data?.primaryColor;
    if (!fetched || !hexColorSchema.safeParse(fetched).success) return;
    try {
      Storage.setItemSync(CACHE_KEY, fetched);
    } catch {
      // The colour is cosmetic; the next fetch tries again.
    }
    if (fetched !== primary && Date.now() - (shownAt ?? Date.now()) < APPLY_LIVE_WITHIN_MS) setPrimary(fetched);
  }, [config.data?.primaryColor, primary, setPrimary]);

  const style = useMemo(() => {
    const palette = primaryPalette(primary);
    return vars(
      Object.fromEntries(
        (Object.keys(palette) as (keyof PrimaryPalette)[]).map((shade) => [`--primary-${shade}`, channels(palette[shade])])
      )
    );
  }, [primary]);

  return (
    <View key={primary} style={[{ flex: 1 }, style]}>
      {children}
    </View>
  );
}
