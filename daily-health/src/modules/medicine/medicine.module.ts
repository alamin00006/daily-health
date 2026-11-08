import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { UsersModule } from '../users/users.module.js';
import { DoseLogsService } from './dose-logs.service.js';
import { DosesController } from './doses.controller.js';
import { MedicationPlansController } from './medication-plans.controller.js';
import { MedicationPlansService } from './medication-plans.service.js';
import { MedicineCatalogController } from './medicine-catalog.controller.js';
import { MedicineCatalogService } from './medicine-catalog.service.js';
import {
  MEDICINE_MAINTENANCE_QUEUE,
  MedicineMaintenanceProcessor,
} from './medicine-maintenance.processor.js';
import { MedicineRemindersService } from './medicine-reminders.service.js';

/**
 * Medicine catalog, plans, doses and adherence (schema `medicine`). Dose
 * alarms ring on the phone; the server keeps the DOSE_BACKUP and REFILL
 * reminders through the notifications module.
 */
@Module({
  imports: [
    UsersModule,
    NotificationsModule,
    BullModule.registerQueue({ name: MEDICINE_MAINTENANCE_QUEUE }),
  ],
  controllers: [
    MedicineCatalogController,
    MedicationPlansController,
    DosesController,
  ],
  providers: [
    MedicineCatalogService,
    MedicationPlansService,
    DoseLogsService,
    MedicineRemindersService,
    MedicineMaintenanceProcessor,
  ],
  // Prescriptions turn an item into a plan in one tap (step 8).
  exports: [MedicationPlansService, MedicineCatalogService],
})
export class MedicineModule {}
