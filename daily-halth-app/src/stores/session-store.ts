import { create } from 'zustand';

import { isApiError } from '@/api/api-error';
import { authEndpoints } from '@/api/auth-endpoints';
import { registerAccessTokenProvider } from '@/api/http-client';
import {
  clearStoredSession,
  readStoredSession,
  writeStoredSession,
} from '@/lib/secure-session-storage';
import type { AuthTokensResponse, AuthUserSummary } from '@/shared-contracts/auth.contract';
import { clearWomensHealthLocks } from '@/features/womens-health/womens-health-lock';
import { getDeviceInfo } from '@/lib/device-identity';

/** Refresh this long before the access token actually expires. */
const EXPIRY_MARGIN_MS = 30_000;
/** The splash waits at most this long for a guest session on first open. */
const GUEST_START_TIMEOUT_MS = 8_000;

export type SessionStatus = 'restoring' | 'signedOut' | 'signedIn';

interface SessionState {
  status: SessionStatus;
  user: AuthUserSummary | null;
  /** Memory only. */
  accessToken: string | null;
  accessTokenExpiresAt: number;

  /**
   * On app start: reads the keychain and, if logged in, refreshes the access token.
   * With no saved session it opens a guest session, so the app starts on home;
   * login is offered when someone picks something that needs an account.
   */
  restore(): Promise<void>;
  /** After login/signup/reset: keeps tokens and marks the user signed in. */
  startSession(tokens: AuthTokensResponse): Promise<void>;
  /** Ends the session on this device; tells the API when it can. */
  signOut(): Promise<void>;
}

export const useSessionStore = create<SessionState>()((set, get) => ({
  status: 'restoring',
  user: null,
  accessToken: null,
  accessTokenExpiresAt: 0,

  async restore() {
    // A broken keychain entry must not leave the app stuck on the splash screen.
    const stored = await readStoredSession().catch(() => null);
    if (!stored) {
      // Offline or the API is down: the welcome screen lets them try again.
      const guest = await startGuestSession().catch(() => null);
      if (!guest) set({ status: 'signedOut', user: null });
      return;
    }
    // Signed in straight away with the saved user, so the app opens offline too
    // (dose alarms are local). The access token is fetched in the background.
    set({ status: 'signedIn', user: stored.user });
    await refreshAccessTokenOnce();
  },

  async startSession(tokens) {
    // Logging in from a guest session needs no extra call: the API signs out whoever
    // was signed in before on this app install (auth-sessions.service.ts).
    await writeStoredSession({ refreshToken: tokens.refreshToken, user: tokens.user });
    set({
      status: 'signedIn',
      user: tokens.user,
      accessToken: tokens.accessToken,
      accessTokenExpiresAt: Date.now() + tokens.accessTokenExpiresInSec * 1000 - EXPIRY_MARGIN_MS,
    });
  },

  async signOut() {
    if (get().accessToken) {
      // Best effort: the local sign-out must work offline too.
      await authEndpoints.logout().catch(() => undefined);
    }
    await clearStoredSession();
    await clearWomensHealthLocks().catch(() => undefined);
    set({ status: 'signedOut', user: null, accessToken: null, accessTokenExpiresAt: 0 });
  },
}));

/** A browse-only guest session (CLAUDE.md §1); null if it could not start in time. */
async function startGuestSession(): Promise<AuthTokensResponse | null> {
  const tokens = await Promise.race([
    authEndpoints.loginAsGuest(await getDeviceInfo()),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), GUEST_START_TIMEOUT_MS)),
  ]);
  if (!tokens) return null;
  await useSessionStore.getState().startSession(tokens);
  return tokens;
}

let refreshInFlight: Promise<string | null> | null = null;

/**
 * One refresh at a time: parallel requests that all found an expired token
 * share it. Rotation makes a second parallel refresh fail on the server.
 */
function refreshAccessTokenOnce(): Promise<string | null> {
  refreshInFlight ??= (async () => {
    try {
      const stored = await readStoredSession();
      if (!stored) return null;
      const tokens = await authEndpoints.refresh(stored.refreshToken);
      await useSessionStore.getState().startSession(tokens);
      return tokens.accessToken;
    } catch (error) {
      // Offline: stay signed in and try again on the next request.
      if (isApiError(error) && error.isConnectivityProblem) return null;
      // Refresh token rejected (expired, revoked, PIN reset elsewhere): log out here.
      await clearStoredSession();
      useSessionStore.setState({
        status: 'signedOut',
        user: null,
        accessToken: null,
        accessTokenExpiresAt: 0,
      });
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

registerAccessTokenProvider({
  async getAccessToken() {
    const { accessToken, accessTokenExpiresAt, status } = useSessionStore.getState();
    if (status !== 'signedIn') return null;
    if (accessToken && Date.now() < accessTokenExpiresAt) return accessToken;
    return refreshAccessTokenOnce();
  },
  refreshAccessToken: refreshAccessTokenOnce,
});
