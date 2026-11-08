import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import { AppConfigService } from '../config/app-config.service.js';

const LOG = [
  { emit: 'event', level: 'warn' },
  { emit: 'event', level: 'error' },
] as const satisfies Prisma.LogDefinition[];

type ClientOptions = { adapter: PrismaPg; log: typeof LOG };

/**
 * Single Prisma client for the whole app (Prisma 7 + node-postgres adapter).
 *
 * Module boundaries still apply: a module only touches the models of its own
 * Postgres schema and reaches other modules through their exported services.
 *
 * Query logging is deliberately off: query params can carry phone numbers and
 * health data, which must never be logged (CLAUDE.md §4).
 */
@Injectable()
export class PrismaService
  extends PrismaClient<ClientOptions>
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: AppConfigService) {
    super({
      adapter: new PrismaPg({ connectionString: config.databaseUrl }),
      log: LOG,
    });

    // Only the message: never the query or its params.
    this.$on('warn', (e) => this.logger.warn(e.message));
    this.$on('error', (e) => this.logger.error(e.message));
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
