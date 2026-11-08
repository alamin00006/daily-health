import { Throttle } from '@nestjs/throttler';

/**
 * Stricter per-IP limit for OTP send/verify routes (each OTP costs an SMS).
 * Kept above a handful because of CGNAT; the auth module also limits per phone.
 */
export const OtpRateLimit = () =>
  Throttle({ default: { limit: 10, ttl: 10 * 60_000 } });
