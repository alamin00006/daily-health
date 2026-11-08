import { Throttle } from '@nestjs/throttler';

/**
 * Per-IP limit for PIN login and token refresh. Generous because of CGNAT;
 * the real brute-force protection is the per-account PIN lockout.
 */
export const LoginRateLimit = () =>
  Throttle({ default: { limit: 30, ttl: 10 * 60_000 } });
