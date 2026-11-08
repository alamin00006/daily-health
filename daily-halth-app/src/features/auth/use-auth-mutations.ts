import { useMutation } from '@tanstack/react-query';

import { authEndpoints } from '@/api/auth-endpoints';
import { clearLocalUserData } from '@/features/app/clear-local-user-data';
import { getDeviceInfo } from '@/lib/device-identity';
import { queryClient } from '@/lib/query-client';
import type { OtpPurpose } from '@/shared-contracts/auth.contract';
import { useAuthFlowStore } from '@/stores/auth-flow-store';
import { useSessionStore } from '@/stores/session-store';

/** Step 1 of every email-code flow. */
export function useSendCodeMutation() {
  const codeSent = useAuthFlowStore((s) => s.codeSent);
  return useMutation({
    mutationFn: ({ email, purpose }: { email: string; purpose: OtpPurpose }) =>
      authEndpoints.sendOtp(email, purpose),
    onSuccess: (response, { email, purpose }) => codeSent(email, purpose, response.resendAfterSec),
  });
}

/**
 * Step 2. For LOGIN the code finishes the login right away; for SIGNUP and
 * RESET_PIN it returns a verification token that the PIN screen spends.
 */
export function useVerifyCodeMutation() {
  const codeVerified = useAuthFlowStore((s) => s.codeVerified);
  const resetFlow = useAuthFlowStore((s) => s.reset);
  const startSession = useSessionStore((s) => s.startSession);

  return useMutation({
    mutationFn: async ({
      email,
      purpose,
      code,
    }: {
      email: string;
      purpose: OtpPurpose;
      code: string;
    }) => {
      const { verificationToken } = await authEndpoints.verifyOtp(email, purpose, code);
      if (purpose !== 'LOGIN') return { loggedIn: false as const, verificationToken };
      const tokens = await authEndpoints.loginWithOtp(verificationToken, await getDeviceInfo());
      return { loggedIn: true as const, tokens };
    },
    onSuccess: async (result) => {
      if (result.loggedIn) {
        resetFlow();
        await startSession(result.tokens);
      } else {
        codeVerified(result.verificationToken);
      }
    },
  });
}

/** Step 3: create the account (SIGNUP) or set a new PIN (RESET_PIN). */
export function useSetPinMutation() {
  const startSession = useSessionStore((s) => s.startSession);
  const resetFlow = useAuthFlowStore((s) => s.reset);

  return useMutation({
    mutationFn: async ({
      purpose,
      verificationToken,
      pin,
    }: {
      purpose: 'SIGNUP' | 'RESET_PIN';
      verificationToken: string;
      pin: string;
    }) => {
      const device = await getDeviceInfo();
      return purpose === 'SIGNUP'
        ? authEndpoints.signup(verificationToken, pin, device)
        : authEndpoints.resetPin(verificationToken, pin, device);
    },
    onSuccess: async (tokens) => {
      resetFlow();
      await startSession(tokens);
    },
  });
}

export function useLoginWithPinMutation() {
  const startSession = useSessionStore((s) => s.startSession);
  return useMutation({
    mutationFn: async ({ email, pin }: { email: string; pin: string }) =>
      authEndpoints.loginWithPin(email, pin, await getDeviceInfo()),
    onSuccess: (tokens) => startSession(tokens),
  });
}

export function useGuestLoginMutation() {
  const startSession = useSessionStore((s) => s.startSession);
  return useMutation({
    mutationFn: async () => authEndpoints.loginAsGuest(await getDeviceInfo()),
    onSuccess: (tokens) => startSession(tokens),
  });
}

export function useSignOutMutation() {
  const signOut = useSessionStore((s) => s.signOut);
  return useMutation({
    mutationFn: async () => {
      await clearLocalUserData();
      await signOut();
    },
    // Nothing cached for one account may be shown to the next one.
    onSuccess: () => queryClient.clear(),
  });
}
