import { Module } from '@nestjs/common';
import { AppointmentsModule } from '../appointments/appointments.module.js';
import { ChatModule } from '../chat/chat.module.js';
import { ConsultationModule } from '../consultation/consultation.module.js';
import { DoctorsModule } from '../doctors/doctors.module.js';
import { MedicineModule } from '../medicine/medicine.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { RecordsModule } from '../records/records.module.js';
import { UsersModule } from '../users/users.module.js';
import { PatientPrescriptionsService } from './patient-prescriptions.service.js';
import { PrescriptionViewsService } from './prescription-views.service.js';
import {
  ProfilePrescriptionsController,
  ProviderPrescriptionsController,
} from './prescriptions.controller.js';
import { ProviderPrescriptionsService } from './provider-prescriptions.service.js';

/**
 * Digital prescriptions (schema `prescriptions`): doctors write and issue them
 * for visits and consultations; families read them, turn medicine lines into
 * alarms (medicine module) and link test reports (records module).
 */
@Module({
  imports: [
    UsersModule,
    DoctorsModule,
    AppointmentsModule,
    ConsultationModule,
    ChatModule,
    MedicineModule,
    RecordsModule,
    NotificationsModule,
  ],
  controllers: [ProviderPrescriptionsController, ProfilePrescriptionsController],
  providers: [PrescriptionViewsService, ProviderPrescriptionsService, PatientPrescriptionsService],
})
export class PrescriptionsModule {}
