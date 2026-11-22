import { Throttle } from '@nestjs/throttler';

/**
 * Per-IP limit for password login and token refresh. Generous because of CGNAT;
 * the real brute-force protection is the per-account password lockout.
 */
export const LoginRateLimit = () =>
  Throttle({ default: { limit: 30, ttl: 10 * 60_000 } });
