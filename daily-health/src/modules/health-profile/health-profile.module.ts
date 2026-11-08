import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module.js';
import {
  HealthCardScanController,
  HealthCardsController,
} from './health-cards.controller.js';
import { HealthCardsService } from './health-cards.service.js';
import { MedicalConditionsController } from './medical-conditions.controller.js';
import { MedicalConditionsService } from './medical-conditions.service.js';
import { VitalReadingsController } from './vital-readings.controller.js';
import { VitalReadingsService } from './vital-readings.service.js';

/** Vitals, conditions and allergies, QR health card (schema `health`). */
@Module({
  imports: [UsersModule],
  controllers: [
    VitalReadingsController,
    MedicalConditionsController,
    HealthCardsController,
    HealthCardScanController,
  ],
  providers: [
    VitalReadingsService,
    MedicalConditionsService,
    HealthCardsService,
  ],
  exports: [VitalReadingsService, MedicalConditionsService],
})
export class HealthProfileModule {}
