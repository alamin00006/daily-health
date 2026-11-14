import { Module } from '@nestjs/common';
import { AppointmentsModule } from '../appointments/appointments.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { ContentModule } from '../content/content.module.js';
import { DoctorsModule } from '../doctors/doctors.module.js';
import { EmergencyModule } from '../emergency/emergency.module.js';
import { PaymentsModule } from '../payments/payments.module.js';
import { UsersModule } from '../users/users.module.js';
import { AdminDashboardService } from './admin-dashboard.service.js';
import { AdminController } from './admin.controller.js';
import { AdminAppConfigController, AppConfigController } from './app-config.controller.js';
import { AppConfigService } from './app-config.service.js';
import { AuditLogWriterService } from './audit-log-writer.service.js';
import { AuditLogsService } from './audit-logs.service.js';
import { StaffAndUsersService } from './staff-and-users.service.js';
import { StaffModule } from './staff.module.js';

/**
 * Admin (schema `admin`): writes the audit log from `audit.*` events, and the
 * admin panel's dashboard, audit log, users and staff. Provider verification,
 * refunds/payouts and quick consult prices live in their own modules.
 */
@Module({
  imports: [
    AuthModule,
    UsersModule,
    DoctorsModule,
    PaymentsModule,
    AppointmentsModule,
    EmergencyModule,
    ContentModule,
    StaffModule,
  ],
  controllers: [AdminController, AppConfigController, AdminAppConfigController],
  providers: [
    AuditLogWriterService,
    AuditLogsService,
    StaffAndUsersService,
    AdminDashboardService,
    AppConfigService,
  ],
})
export class AdminModule {}
