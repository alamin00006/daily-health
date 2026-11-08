import { Global, Module } from '@nestjs/common';
import { ReadableIdService } from './readable-id.service.js';

/** Readable IDs (PR-2611-0042) for patients, doctors and staff. */
@Global()
@Module({
  providers: [ReadableIdService],
  exports: [ReadableIdService],
})
export class ReadableIdsModule {}
