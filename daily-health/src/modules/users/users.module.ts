import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { MeController } from './me.controller.js';
import { PatientProfilesController } from './patient-profiles.controller.js';
import { PatientProfilesService } from './patient-profiles.service.js';
import { ProfileAccessService } from './profile-access.service.js';
import {
  MyProfileInvitesController,
  ProfileInvitesController,
} from './profile-invites.controller.js';
import { ProfileInvitesService } from './profile-invites.service.js';
import { ProfileMembersController } from './profile-members.controller.js';
import { ProfileMembersService } from './profile-members.service.js';
import { ProfileAccessGuard } from './require-profile-access.guard.js';

@Module({
  imports: [AuthModule],
  controllers: [
    MeController,
    PatientProfilesController,
    ProfileMembersController,
    ProfileInvitesController,
    MyProfileInvitesController,
  ],
  providers: [
    PatientProfilesService,
    ProfileMembersService,
    ProfileInvitesService,
    ProfileAccessService,
    ProfileAccessGuard,
  ],
  // Every module that touches a PatientProfile checks access through these.
  exports: [ProfileAccessService, ProfileAccessGuard, PatientProfilesService],
})
export class UsersModule {}
