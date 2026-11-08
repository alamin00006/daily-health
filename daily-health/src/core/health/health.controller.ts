import {
  Controller,
  Get,
  HttpStatus,
  Inject,
  ServiceUnavailableException,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckService,
  HealthIndicatorService,
  type HealthCheckResult,
} from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';
import type { Redis } from 'ioredis';
import { PublicRoute } from '../../common/auth/auth-route.decorators.js';
import { AppException } from '../../common/errors/app-exception.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { REDIS_CLIENT } from '../redis/redis.module.js';

const CHECK_TIMEOUT_MS = 2_000;

/** GET /health (not versioned): used by Docker, Nginx and uptime monitors. */
@ApiTags('health')
@PublicRoute()
@SkipThrottle()
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly indicator: HealthIndicatorService,
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  @Get()
  @HealthCheck()
  @ApiOkResponse({ description: 'Database and Redis are reachable' })
  async check(): Promise<HealthCheckResult> {
    try {
      return await this.health.check([
        () =>
          this.indicator
            .check('database')
            .attempt(async () => {
              await this.prisma.$queryRaw`SELECT 1`;
            })
            .withTimeout(CHECK_TIMEOUT_MS),
        () =>
          this.indicator
            .check('redis')
            .attempt(async () => {
              await this.redis.ping();
            })
            .withTimeout(CHECK_TIMEOUT_MS),
      ]);
    } catch (error) {
      if (!(error instanceof ServiceUnavailableException)) throw error;
      // Report only which dependency is down, not raw driver error messages.
      const result = error.getResponse() as Partial<HealthCheckResult>;
      const statuses = Object.fromEntries(
        Object.entries(result.details ?? {}).map(([name, detail]) => [
          name,
          detail.status,
        ]),
      );
      throw new AppException(
        ErrorCode.SERVICE_UNAVAILABLE,
        'A dependency is unavailable',
        HttpStatus.SERVICE_UNAVAILABLE,
        statuses,
      );
    }
  }
}
