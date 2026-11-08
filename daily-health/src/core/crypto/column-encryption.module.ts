import { Global, Module } from '@nestjs/common';
import { ColumnEncryptionService } from './column-encryption.service.js';

@Global()
@Module({
  providers: [ColumnEncryptionService],
  exports: [ColumnEncryptionService],
})
export class ColumnEncryptionModule {}
