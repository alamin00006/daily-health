import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AppConfigModule } from './config/app-config.module.js';
import { ColumnEncryptionModule } from './crypto/column-encryption.module.js';
import { EventsModule } from './events/events.module.js';
import { HealthModule } from './health/health.module.js';
import { AllExceptionsFilter } from './http/all-exceptions.filter.js';
import { LoggingModule } from './logging/logging.module.js';
import { MailModule } from './mail/mail.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { ReadableIdsModule } from './readable-ids/readable-ids.module.js';
import { QueueModule } from './queue/queue.module.js';
import { RedisModule } from './redis/redis.module.js';
import { StorageModule } from './storage/storage.module.js';
import { ThrottlingModule } from './throttling/throttling.module.js';
import { UploadsModule } from './uploads/uploads.module.js';

/** Infrastructure every feature module relies on. Imported once by AppModule. */
@Module({
  imports: [
    AppConfigModule,
    LoggingModule,
    PrismaModule,
    ReadableIdsModule,
    RedisModule,
    QueueModule,
    MailModule,
    EventsModule,
    ThrottlingModule,
    ColumnEncryptionModule,
    StorageModule,
    UploadsModule,
    HealthModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
})
export class CoreModule {}
