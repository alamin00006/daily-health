import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module.js';
import { MedicalFilesController } from './medical-files.controller.js';
import { MedicalFilesService } from './medical-files.service.js';

/**
 * Lab reports, prescription scans, imaging (schema `records`).
 * MedicalFileShare (time-limited access for a doctor) gets its routes with the
 * doctors + appointments modules, which own Provider and Appointment.
 */
@Module({
  imports: [UsersModule],
  controllers: [MedicalFilesController],
  providers: [MedicalFilesService],
  exports: [MedicalFilesService],
})
export class RecordsModule {}
