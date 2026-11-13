import { Module } from '@nestjs/common';
import { StaffModule } from '../admin/staff.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { HealthProfileModule } from '../health-profile/health-profile.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { UsersModule } from '../users/users.module.js';
import { EmergencyContactsService } from './emergency-contacts.service.js';
import { ProfileEmergencyController, StaffEmergencyController } from './emergency.controller.js';
import { EmergencyRequestsService } from './emergency-requests.service.js';

/** আকস্মিক সেবা: emergency contacts and SOS requests (schema `emergency`). */
@Module({
  imports: [UsersModule, AuthModule, HealthProfileModule, NotificationsModule, StaffModule],
  controllers: [ProfileEmergencyController, StaffEmergencyController],
  providers: [EmergencyContactsService, EmergencyRequestsService],
  exports: [EmergencyRequestsService],
})
export class EmergencyModule {}
