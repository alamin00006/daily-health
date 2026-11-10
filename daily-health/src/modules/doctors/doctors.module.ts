import { Module } from '@nestjs/common';
import { StaffRoleGuard } from '../../common/auth/staff-role.guard.js';
import { AuthModule } from '../auth/auth.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { UsersModule } from '../users/users.module.js';
import { FavoriteProvidersController } from './favorite-providers.controller.js';
import { FavoriteProvidersService } from './favorite-providers.service.js';
import { MyProviderProfileController } from './my-provider-profile.controller.js';
import { MyProviderScheduleController } from './my-provider-schedule.controller.js';
import { ProviderDirectoryController } from './provider-directory.controller.js';
import { ProviderDirectoryService } from './provider-directory.service.js';
import { ProviderProfileService } from './provider-profile.service.js';
import { ProviderReviewsService } from './provider-reviews.service.js';
import { ProviderSchedulesService } from './provider-schedules.service.js';
import { ProviderVerificationController } from './provider-verification.controller.js';
import { ProviderVerificationService } from './provider-verification.service.js';

/**
 * Doctors, nutritionists and physiotherapists (schema `providers`): search,
 * provider pages, the provider's own profile and schedule (web panel), admin
 * verification and "my doctors". Bookings live in the appointments module.
 */
@Module({
  imports: [AuthModule, UsersModule, NotificationsModule],
  controllers: [
    ProviderDirectoryController,
    MyProviderProfileController,
    MyProviderScheduleController,
    ProviderVerificationController,
    FavoriteProvidersController,
  ],
  providers: [
    ProviderDirectoryService,
    ProviderProfileService,
    ProviderSchedulesService,
    ProviderVerificationService,
    FavoriteProvidersService,
    ProviderReviewsService,
    StaffRoleGuard,
  ],
  exports: [
    ProviderDirectoryService,
    ProviderReviewsService,
    FavoriteProvidersService,
  ],
})
export class DoctorsModule {}
