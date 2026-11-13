import { Module } from '@nestjs/common';
import { StaffDirectoryService } from './staff-directory.service.js';

/** Staff names for other modules (emergency, content); see StaffDirectoryService. */
@Module({
  providers: [StaffDirectoryService],
  exports: [StaffDirectoryService],
})
export class StaffModule {}
