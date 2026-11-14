import { Global, Module } from '@nestjs/common';
import { S3CompatibleStorageService } from './s3-compatible-storage.service.js';
import { StorageService } from './storage.service.js';

/** Files in Cloudflare R2 or AWS S3 (STORAGE_PROVIDER; CLAUDE.md §5). */
@Global()
@Module({
  providers: [{ provide: StorageService, useClass: S3CompatibleStorageService }],
  exports: [StorageService],
})
export class StorageModule {}
