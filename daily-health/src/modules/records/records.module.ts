import { Module } from '@nestjs/common';
import { DoctorsModule } from '../doctors/doctors.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { UsersModule } from '../users/users.module.js';
import { MedicalFilesController } from './medical-files.controller.js';
import { MedicalFilesService } from './medical-files.service.js';
import {
  ProfileRecordSharesController,
  ProviderSharedRecordsController,
} from './record-shares.controller.js';
import { RecordSharesService } from './record-shares.service.js';

/**
 * Lab reports, prescription scans, imaging (schema `records`), and sharing the
 * whole file history with a doctor for a while (RecordShare).
 * MedicalFileShare (one file, tied to an appointment) has no routes yet.
 */
@Module({
  imports: [UsersModule, DoctorsModule, NotificationsModule],
  controllers: [
    MedicalFilesController,
    ProfileRecordSharesController,
    ProviderSharedRecordsController,
  ],
  providers: [MedicalFilesService, RecordSharesService],
  exports: [MedicalFilesService],
})
export class RecordsModule {}
