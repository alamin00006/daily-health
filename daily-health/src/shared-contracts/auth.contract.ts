import { z } from 'zod';
import {
  bangladeshPhoneSchema,
  deviceInfoSchema,
  emailSchema,
  otpCodeSchema,
  passwordSchema,
} from './common-fields.contract.js';

export const otpPurposeSchema = z.enum(['SIGNUP', 'LOGIN', 'RESET_PASSWORD']);
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

/**
 * Who is signing in: an email address (code by email) or a Bangladeshi mobile number
 * (code by SMS). Exactly one of the two. The phone is normalised to +8801XXXXXXXXX.
 */
const accountIdFields = {
  email: emailSchema.optional(),
  phone: bangladeshPhoneSchema.optional(),
};
const oneAccountId = (body: { email?: string; phone?: string }) =>
  Boolean(body.email) !== Boolean(body.phone);
const oneAccountIdIssue = { path: ['email'], message: 'Give either email or phone' };

// POST /api/v1/auth/otp/send
export const sendOtpRequestSchema = z
  .object({ ...accountIdFields, purpose: otpPurposeSchema })
  .refine(oneAccountId, oneAccountIdIssue);
export type SendOtpRequest = z.infer<typeof sendOtpRequestSchema>;
/** Same response whether or not the email / phone has an account (no account enumeration). */
export interface SendOtpResponse {
  expiresInSec: number;
  resendAfterSec: number;
}

// POST /api/v1/auth/otp/verify
export const verifyOtpRequestSchema = z
  .object({ ...accountIdFields, purpose: otpPurposeSchema, code: otpCodeSchema })
  .refine(oneAccountId, oneAccountIdIssue);
export type VerifyOtpRequest = z.infer<typeof verifyOtpRequestSchema>;
/** Single-use proof that the email / phone was verified; spent by signup / OTP login / password reset. */
export interface VerifyOtpResponse {
  verificationToken: string;
  expiresInSec: number;
}

const verificationTokenSchema = z.string().min(20).max(2048);

/** The person's name as typed at sign-up (Bangla or English). */
export const fullNameSchema = z
  .string()
  .trim()
  .transform((name) => name.replace(/\s+/g, ' '))
  .pipe(z.string().min(2, 'At least 2 characters').max(80));

// POST /api/v1/auth/signup
// The app signs up with a verified phone plus an optional (unverified) email and a
// coupon code (Roadmap doc, 2026-11-26); the panel still signs up with a verified email.
export const signupRequestSchema = z.object({
  verificationToken: verificationTokenSchema,
  password: passwordSchema,
  /** Optional for older app builds and the panel; the app's form always sends it. */
  fullName: fullNameSchema.optional(),
  /** Extra contact email for a phone sign-up. Stored unverified; ignored for an email sign-up. */
  email: emailSchema.optional(),
  /** Checked with POST /coupons/check first; claimed after the account is made. */
  couponCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{3,32}$/)
    .optional(),
  device: deviceInfoSchema,
});
export type SignupRequest = z.infer<typeof signupRequestSchema>;

// POST /api/v1/auth/login
export const loginWithPasswordRequestSchema = z
  .object({
    ...accountIdFields,
    // Not passwordSchema: a password set under older rules must still be able to log in.
    password: z.string().min(1).max(128),
    device: deviceInfoSchema,
  })
  .refine(oneAccountId, oneAccountIdIssue);
export type LoginWithPasswordRequest = z.infer<typeof loginWithPasswordRequestSchema>;

// POST /api/v1/auth/login/otp
export const loginWithOtpRequestSchema = z.object({
  verificationToken: verificationTokenSchema,
  device: deviceInfoSchema,
});
export type LoginWithOtpRequest = z.infer<typeof loginWithOtpRequestSchema>;

// POST /api/v1/auth/password/reset
export const resetPasswordRequestSchema = z.object({
  verificationToken: verificationTokenSchema,
  newPassword: passwordSchema,
  device: deviceInfoSchema,
});
export type ResetPasswordRequest = z.infer<typeof resetPasswordRequestSchema>;

// POST /api/v1/auth/password/change
export const changePasswordRequestSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: passwordSchema,
  })
  .refine((body) => body.currentPassword !== body.newPassword, {
    path: ['newPassword'],
    message: 'New password must differ from the current password',
  });
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;

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
  /** E.164; set for accounts opened (or verified) with a phone number. */
  phone: string | null;
  /** Name typed at sign-up; null for guests and older accounts. */
  fullName: string | null;
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
