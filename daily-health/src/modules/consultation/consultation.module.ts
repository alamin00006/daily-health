import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { StaffRoleGuard } from '../../common/auth/staff-role.guard.js';
import { AppointmentsModule } from '../appointments/appointments.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { ChatModule } from '../chat/chat.module.js';
import { DoctorsModule } from '../doctors/doctors.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { PaymentsModule } from '../payments/payments.module.js';
import { UsersModule } from '../users/users.module.js';
import {
  CONSULTATION_TIMERS_QUEUE,
  ConsultationTimersProcessor,
} from './consultation-timers.processor.js';
import { ConsultationViewsService } from './consultation-views.service.js';
import { ConsultationsController } from './consultations.controller.js';
import { ConsultationsService } from './consultations.service.js';
import {
  AdminQuickConsultSettingsController,
  ProviderConsultationsController,
} from './provider-consultations.controller.js';
import { QuickConsultSettingsService } from './quick-consult-settings.service.js';
import { QuickConsultsService } from './quick-consults.service.js';
import { AgoraVideoProvider } from './video/agora-video-provider.service.js';
import { VideoProvider } from './video/video-provider.js';

/**
 * Consultations (schema `consultation`): the sessions of booked VIDEO/CHAT
 * appointments and the pay-and-wait quick chat consults, with their queue,
 * admin-set prices and Agora calls. Chat lives in the chat module; payment in
 * the payments module (QUICK_CONSULT is registered as payable here).
 */
@Module({
  imports: [
    AuthModule,
    UsersModule,
    DoctorsModule,
    AppointmentsModule,
    PaymentsModule,
    ChatModule,
    NotificationsModule,
    BullModule.registerQueue({ name: CONSULTATION_TIMERS_QUEUE }),
  ],
  controllers: [
    ConsultationsController,
    ProviderConsultationsController,
    AdminQuickConsultSettingsController,
  ],
  providers: [
    { provide: VideoProvider, useClass: AgoraVideoProvider },
    ConsultationViewsService,
    ConsultationsService,
    QuickConsultSettingsService,
    QuickConsultsService,
    ConsultationTimersProcessor,
    StaffRoleGuard,
  ],
  exports: [ConsultationsService],
})
export class ConsultationModule {}
