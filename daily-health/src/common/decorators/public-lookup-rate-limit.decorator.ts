import { Throttle } from '@nestjs/throttler';

/**
 * Per-IP limit for public lookups by secret token (health card scans), so
 * tokens cannot be guessed by brute force. High enough for a hospital desk
 * behind one CGNAT address.
 */
export const PublicLookupRateLimit = () =>
  Throttle({ default: { limit: 30, ttl: 10 * 60_000 } });
