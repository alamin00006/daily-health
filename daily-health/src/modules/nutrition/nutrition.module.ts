import { Module } from '@nestjs/common';
import { AppointmentsModule } from '../appointments/appointments.module.js';
import { DoctorsModule } from '../doctors/doctors.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { UsersModule } from '../users/users.module.js';
import { DietPlanViewsService } from './diet-plan-views.service.js';
import { ProfileDietController, ProviderDietPlansController } from './nutrition.controller.js';
import { PatientDietService } from './patient-diet.service.js';
import { ProviderDietPlansService } from './provider-diet-plans.service.js';

/**
 * Nutrition (schema `nutrition`): diet plans a provider writes after a visit (booked and
 * paid as a normal appointment), and the family's daily meal check-offs and water.
 */
@Module({
  imports: [UsersModule, DoctorsModule, AppointmentsModule, NotificationsModule],
  controllers: [ProviderDietPlansController, ProfileDietController],
  providers: [DietPlanViewsService, ProviderDietPlansService, PatientDietService],
})
export class NutritionModule {}
