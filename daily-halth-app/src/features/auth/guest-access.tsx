import { router } from 'expo-router';
import { useEffect, type ReactNode } from 'react';

import { useSessionStore } from '@/stores/session-store';

/**
 * Screens a guest may open (route names in the (app) stack): home and the other
 * tabs' shell, finding doctors, health tips, browsing the shop, reading the common
 * community, SOS helplines and settings. Everything else needs an account and opens login instead.
 */
const GUEST_ROUTES = [
  /^\(tabs\)$/,
  /^settings$/,
  /^payment-result$/,
  /^tips(\/.*)?$/,
  /^emergency(\/index)?$/,
  /^shop(\/index)?$/,
  /^shop\/products$/,
  /^shop\/product\/.+$/,
  /^doctors\/\[providerId\](\/index)?$/,
  /^community\/\[postId\]$/,
];

/** Tabs a guest may switch to; the others open login. */
export const GUEST_TABS = new Set(['home', 'doctors', 'community']);

export function guestMayOpen(routeName: string): boolean {
  return GUEST_ROUTES.some((pattern) => pattern.test(routeName));
}

export function useIsGuest(): boolean {
  return useSessionStore((s) => s.status === 'signedIn' && (s.user?.isGuest ?? false));
}

/** The login screen, on top of what the guest was looking at. */
export function openLogin(): void {
  router.push('/login');
}

/**
 * Wraps every screen of the (app) stack: for a guest on a screen that needs an
 * account, renders nothing (so no private data is asked for), steps back and
 * opens login.
 */
export function GuestGate({ routeName, children }: { routeName: string; children: ReactNode }) {
  const isGuest = useIsGuest();
  const blocked = isGuest && !guestMayOpen(routeName);

  useEffect(() => {
    if (!blocked) return;
    if (router.canGoBack()) router.back();
    // After the back step has settled, so login lands on top of the previous screen.
    // Not cancelled on unmount: stepping back unmounts this very screen.
    setTimeout(openLogin, 0);
  }, [blocked]);

  return blocked ? null : children;
}
