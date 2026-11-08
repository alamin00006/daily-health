import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

/**
 * Per-IP rate limit for every route. Stricter limits are applied per route
 * with decorators such as @OtpRateLimit().
 *
 * Bangladeshi mobile carriers put many users behind one IP (CGNAT), so IP
 * limits stay generous; per-phone limits (OTP attempts) live in the auth module.
 *
 * Storage is in-memory: fine for the single API container on the VPS. Switch
 * to a Redis-backed ThrottlerStorage before running more than one instance.
 */
@Module({
  imports: [
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: 120 }],
    }),
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class ThrottlingModule {}
