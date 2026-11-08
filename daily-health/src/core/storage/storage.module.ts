import { Global, Module } from '@nestjs/common';
import { LocalDiskStorageService } from './local-disk-storage.service.js';
import { StorageService } from './storage.service.js';

/** Swap `useClass` to an S3 implementation after ~10,000 users (CLAUDE.md §5). */
@Global()
@Module({
  providers: [{ provide: StorageService, useClass: LocalDiskStorageService }],
  exports: [StorageService],
})
export class StorageModule {}
