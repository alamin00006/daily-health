import {
  Global,
  Inject,
  Injectable,
  Logger,
  Module,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { Redis } from 'ioredis';
import { AppConfigService } from '../config/app-config.service.js';

/** Shared Redis client (health check, caches). BullMQ opens its own connections. */
export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

@Injectable()
class RedisClientCloser implements OnApplicationShutdown {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    await this.redis.quit();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => {
        const logger = new Logger('Redis');
        const client = new Redis(config.redisUrl, {
          maxRetriesPerRequest: 2,
        });
        // Without a listener ioredis prints "Unhandled error event".
        client.on('error', (error: Error) => logger.error(error.message));
        return client;
      },
    },
    RedisClientCloser,
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
