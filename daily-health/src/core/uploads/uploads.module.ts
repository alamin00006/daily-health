import { Global, Module } from '@nestjs/common';
import { StoredUploadsService } from './stored-uploads.service.js';
import { UploadedFileProcessorService } from './uploaded-file-processor.service.js';

/** Upload pipeline shared by records (reports) and users (profile photos). */
@Global()
@Module({
  providers: [UploadedFileProcessorService, StoredUploadsService],
  exports: [UploadedFileProcessorService, StoredUploadsService],
})
export class UploadsModule {}
