// Copied from the API (daily-health/src/shared-contracts) by scripts/copy-shared-contracts.mjs. Do not edit here.
import { z } from 'zod';
import {
  deviceInfoSchema,
  emailSchema,
  otpCodeSchema,
  pinSchema,
} from './common-fields.contract';

export const otpPurposeSchema = z.enum(['SIGNUP', 'LOGIN', 'RESET_PIN']);
export type OtpPurpose = z.infer<typeof otpPurposeSchema>;

export const userRoleSchema = z.enum([
  'PATIENT',
  'DOCTOR',
  'NUTRITIONIST',
  'PHYSIO',
  'MODERATOR',
  'ADMIN',
]);
export type UserRole = z.infer<typeof userRoleSchema>;

// POST /api/v1/auth/otp/send
export const sendOtpRequestSchema = z.object({
  email: emailSchema,
  purpose: otpPurposeSchema,
});
export type SendOtpRequest = z.infer<typeof sendOtpRequestSchema>;
/** Same response whether or not the email has an account (no account enumeration). */
export interface SendOtpResponse {
  expiresInSec: number;
  resendAfterSec: number;
}

// POST /api/v1/auth/otp/verify
export const verifyOtpRequestSchema = z.object({
  email: emailSchema,
  purpose: otpPurposeSchema,
  code: otpCodeSchema,
});
export type VerifyOtpRequest = z.infer<typeof verifyOtpRequestSchema>;
/** Single-use proof that the email was verified; spent by signup / OTP login / PIN reset. */
export interface VerifyOtpResponse {
  verificationToken: string;
  expiresInSec: number;
}

const verificationTokenSchema = z.string().min(20).max(2048);

// POST /api/v1/auth/signup
export const signupRequestSchema = z.object({
  verificationToken: verificationTokenSchema,
  pin: pinSchema,
  device: deviceInfoSchema,
});
export type SignupRequest = z.infer<typeof signupRequestSchema>;

// POST /api/v1/auth/login
export const loginWithPinRequestSchema = z.object({
  email: emailSchema,
  // Not pinSchema: an old PIN that is "too easy" today must still be able to log in.
  pin: z.string().regex(/^\d{6}$/),
  device: deviceInfoSchema,
});
export type LoginWithPinRequest = z.infer<typeof loginWithPinRequestSchema>;

// POST /api/v1/auth/login/otp
export const loginWithOtpRequestSchema = z.object({
  verificationToken: verificationTokenSchema,
  device: deviceInfoSchema,
});
export type LoginWithOtpRequest = z.infer<typeof loginWithOtpRequestSchema>;

// POST /api/v1/auth/pin/reset
export const resetPinRequestSchema = z.object({
  verificationToken: verificationTokenSchema,
  newPin: pinSchema,
  device: deviceInfoSchema,
});
export type ResetPinRequest = z.infer<typeof resetPinRequestSchema>;

// POST /api/v1/auth/pin/change
export const changePinRequestSchema = z
  .object({
    currentPin: z.string().regex(/^\d{6}$/),
    newPin: pinSchema,
  })
  .refine((body) => body.currentPin !== body.newPin, {
    path: ['newPin'],
    message: 'New PIN must differ from the current PIN',
  });
export type ChangePinRequest = z.infer<typeof changePinRequestSchema>;

// POST /api/v1/auth/guest
export const guestLoginRequestSchema = z.object({ device: deviceInfoSchema });
export type GuestLoginRequest = z.infer<typeof guestLoginRequestSchema>;

// POST /api/v1/auth/refresh
export const refreshTokenRequestSchema = z.object({
  refreshToken: z.string().min(20).max(512),
});
export type RefreshTokenRequest = z.infer<typeof refreshTokenRequestSchema>;

// PUT /api/v1/auth/device/push-token
export const updatePushTokenRequestSchema = z.object({
  /** null = notification permission revoked. */
  pushToken: z.string().trim().min(1).max(255).nullable(),
});
export type UpdatePushTokenRequest = z.infer<
  typeof updatePushTokenRequestSchema
>;

export interface AuthUserSummary {
  id: string;
  email: string | null;
  role: UserRole;
  isGuest: boolean;
}

export interface AuthTokensResponse {
  accessToken: string;
  accessTokenExpiresInSec: number;
  /** Store in expo-secure-store. Rotated on every refresh; reuse revokes the session. */
  refreshToken: string;
  user: AuthUserSummary;
}
