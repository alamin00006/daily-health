import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { DoctorsModule } from '../doctors/doctors.module.js';
import { PaymentsModule } from '../payments/payments.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { UsersModule } from '../users/users.module.js';
import { AppointmentAvailabilityService } from './appointment-availability.service.js';
import {
  APPOINTMENT_HOLDS_QUEUE,
  AppointmentBookingService,
} from './appointment-booking.service.js';
import { AppointmentHoldsProcessor } from './appointment-holds.processor.js';
import { AppointmentLookupService } from './appointment-lookup.service.js';
import { AppointmentPaymentsService } from './appointment-payments.service.js';
import { AppointmentRemindersService } from './appointment-reminders.service.js';
import { AppointmentViewsService } from './appointment-views.service.js';
import { FollowUpsController } from './follow-ups.controller.js';
import { FollowUpsService } from './follow-ups.service.js';
import { MyProviderAppointmentsController } from './my-provider-appointments.controller.js';
import { PatientAppointmentsService } from './patient-appointments.service.js';
import {
  ProfileAppointmentsController,
  ProviderAvailabilityController,
} from './profile-appointments.controller.js';
import { ProviderAppointmentsService } from './provider-appointments.service.js';

/**
 * Bookings (chamber serials, video/chat/home-visit slots), slot holds,
 * follow-ups and their reminders (schema `appointments`). Provider data comes
 * from the doctors module; payment (payments module) confirms through
 * `payment.succeeded`, and a paid cancellation is refunded there.
 */
@Module({
  imports: [
    UsersModule,
    NotificationsModule,
    DoctorsModule,
    PaymentsModule,
    BullModule.registerQueue({ name: APPOINTMENT_HOLDS_QUEUE }),
  ],
  controllers: [
    ProviderAvailabilityController,
    ProfileAppointmentsController,
    FollowUpsController,
    MyProviderAppointmentsController,
  ],
  providers: [
    AppointmentAvailabilityService,
    AppointmentBookingService,
    AppointmentViewsService,
    AppointmentRemindersService,
    PatientAppointmentsService,
    ProviderAppointmentsService,
    FollowUpsService,
    AppointmentHoldsProcessor,
    AppointmentPaymentsService,
    AppointmentLookupService,
  ],
  // Consultation (step 7) and prescriptions (step 8) read appointments.
  exports: [
    PatientAppointmentsService,
    ProviderAppointmentsService,
    AppointmentLookupService,
  ],
})
export class AppointmentsModule {}
