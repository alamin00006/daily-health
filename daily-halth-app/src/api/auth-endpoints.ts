import { apiRequest } from './http-client';

import type {
  AuthTokensResponse,
  OtpPurpose,
  SendOtpResponse,
  VerifyOtpResponse,
} from '@/shared-contracts/auth.contract';
import type { DeviceInfo } from '@/shared-contracts/common-fields.contract';

/** Thin typed wrappers over /api/v1/auth/* and /api/v1/me. Field names match the API contracts. */
export const authEndpoints = {
  sendOtp: (email: string, purpose: OtpPurpose) =>
    apiRequest<SendOtpResponse>('/auth/otp/send', {
      method: 'POST',
      body: { email, purpose },
    }),

  verifyOtp: (email: string, purpose: OtpPurpose, code: string) =>
    apiRequest<VerifyOtpResponse>('/auth/otp/verify', {
      method: 'POST',
      body: { email, purpose, code },
    }),

  signup: (verificationToken: string, pin: string, device: DeviceInfo) =>
    apiRequest<AuthTokensResponse>('/auth/signup', {
      method: 'POST',
      body: { verificationToken, pin, device },
    }),

  loginWithPin: (email: string, pin: string, device: DeviceInfo) =>
    apiRequest<AuthTokensResponse>('/auth/login', {
      method: 'POST',
      body: { email, pin, device },
    }),

  loginWithOtp: (verificationToken: string, device: DeviceInfo) =>
    apiRequest<AuthTokensResponse>('/auth/login/otp', {
      method: 'POST',
      body: { verificationToken, device },
    }),

  resetPin: (verificationToken: string, newPin: string, device: DeviceInfo) =>
    apiRequest<AuthTokensResponse>('/auth/pin/reset', {
      method: 'POST',
      body: { verificationToken, newPin, device },
    }),

  loginAsGuest: (device: DeviceInfo) =>
    apiRequest<AuthTokensResponse>('/auth/guest', { method: 'POST', body: { device } }),

  refresh: (refreshToken: string) =>
    apiRequest<AuthTokensResponse>('/auth/refresh', { method: 'POST', body: { refreshToken } }),

  logout: () => apiRequest<void>('/auth/logout', { method: 'POST', authenticated: true }),
};
