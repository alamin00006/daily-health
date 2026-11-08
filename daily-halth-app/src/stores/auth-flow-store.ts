import { create } from 'zustand';

import type { OtpPurpose } from '@/shared-contracts/auth.contract';

/**
 * State carried between the steps of one email-code flow
 * (enter email → enter code → set PIN). Memory only, never persisted,
 * so the verification token is not left on the device.
 */
interface AuthFlowState {
  email: string | null;
  purpose: OtpPurpose | null;
  /** Epoch ms after which "send code again" is allowed. */
  resendAvailableAt: number;
  /** Single-use token from otp/verify, spent by signup or PIN reset. */
  verificationToken: string | null;

  codeSent(email: string, purpose: OtpPurpose, resendAfterSec: number): void;
  codeVerified(verificationToken: string): void;
  reset(): void;
}

const EMPTY = {
  email: null,
  purpose: null,
  resendAvailableAt: 0,
  verificationToken: null,
} as const;

export const useAuthFlowStore = create<AuthFlowState>()((set) => ({
  ...EMPTY,
  codeSent: (email, purpose, resendAfterSec) =>
    set({
      email,
      purpose,
      resendAvailableAt: Date.now() + resendAfterSec * 1000,
      verificationToken: null,
    }),
  codeVerified: (verificationToken) => set({ verificationToken }),
  reset: () => set(EMPTY),
}));
