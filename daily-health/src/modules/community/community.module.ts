import { Module } from '@nestjs/common';
import { StaffRoleGuard } from '../../common/auth/staff-role.guard.js';
import { StaffModule } from '../admin/staff.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { DoctorsModule } from '../doctors/doctors.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { UsersModule } from '../users/users.module.js';
import { CommunityAccessService } from './community-access.service.js';
import { CommunityModerationService } from './community-moderation.service.js';
import { CommunityPostsService } from './community-posts.service.js';
import {
  CommunityReadController,
  CommunityWriteController,
  StaffCommunityController,
} from './community.controller.js';

/**
 * Community (schema `community`): the common community and the closed women's
 * community (join request + moderator approval), answers, likes, reports, bans.
 */
@Module({
  imports: [AuthModule, UsersModule, DoctorsModule, NotificationsModule, StaffModule],
  controllers: [CommunityReadController, CommunityWriteController, StaffCommunityController],
  providers: [CommunityAccessService, CommunityPostsService, CommunityModerationService, StaffRoleGuard],
  exports: [CommunityModerationService],
})
export class CommunityModule {}
