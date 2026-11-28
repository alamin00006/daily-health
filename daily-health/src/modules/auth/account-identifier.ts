import type { OtpChannel, Prisma } from '../../generated/prisma/client.js';

/**
 * How a person signs in: a lowercased email (code by email) or an E.164 Bangladeshi
 * mobile number (code by SMS). OtpCode.destination and the verification token carry
 * the value itself; a phone always starts with "+", an email never does.
 */
export interface AccountIdentifier {
  channel: OtpChannel;
  destination: string;
}

/** From a request body that has exactly one of `email` / `phone` (checked by the contract). */
export function accountIdentifierOf(body: { email?: string; phone?: string }): AccountIdentifier {
  if (body.phone) return { channel: 'SMS', destination: body.phone };
  if (body.email) return { channel: 'EMAIL', destination: body.email };
  throw new Error('accountIdentifierOf: neither email nor phone');
}

export function channelOfDestination(destination: string): OtpChannel {
  return destination.startsWith('+') ? 'SMS' : 'EMAIL';
}

/** The unique User column for this destination. */
export function userWhereDestination(destination: string): Prisma.UserWhereUniqueInput {
  return channelOfDestination(destination) === 'SMS' ? { phone: destination } : { email: destination };
}

/**
 * Emitted with the code for an SMS; the notifications module sends it. In-process
 * only: the payload is never logged or stored.
 */
export const AUTH_OTP_SMS_EVENT = 'auth.otp-sms';
export interface AuthOtpSmsEvent {
  phone: string;
  text: string;
}

/**
 * Emitted after a new account is committed. Payments claims `couponCode` from it
 * (payments imports auth, so auth cannot call payments directly).
 */
export const USER_SIGNED_UP_EVENT = 'auth.user-signed-up';
export interface UserSignedUpEvent {
  userId: string;
  /** Uppercased; null when the form had none. */
  couponCode: string | null;
}
