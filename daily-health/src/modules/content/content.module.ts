import { Module } from '@nestjs/common';
import { StaffModule } from '../admin/staff.module.js';
import { DoctorsModule } from '../doctors/doctors.module.js';
import { HealthTipsController, StaffHealthTipsController } from './health-tips.controller.js';
import { HealthTipsService } from './health-tips.service.js';

/** Health tips on home (schema `content`). */
@Module({
  imports: [DoctorsModule, StaffModule],
  controllers: [HealthTipsController, StaffHealthTipsController],
  providers: [HealthTipsService],
  exports: [HealthTipsService],
})
export class ContentModule {}
