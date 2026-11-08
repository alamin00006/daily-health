import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  RegisteredUsersOnly,
} from '../../common/auth/auth-route.decorators.js';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.js';
import { UuidParam } from '../../common/pipes/uuid-param.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { ApiZodBody } from '../../common/swagger/api-zod-body.decorator.js';
import type { PaginatedResponse } from '../../shared-contracts/common-fields.contract.js';
import {
  createInviteRequestSchema,
  type CreateInviteRequest,
  type PatientProfileResponse,
  type ProfileInviteResponse,
} from '../../shared-contracts/profiles.contract.js';
import { ProfileAction, type ProfileAccess } from './profile-access.service.js';
import { ProfileInvitesService } from './profile-invites.service.js';
import {
  CurrentProfileAccess,
  RequireProfileAccess,
} from './require-profile-access.guard.js';

/** The OWNER's side: invite people to a profile. */
@ApiTags('profile invites')
@ApiBearerAuth()
@RegisteredUsersOnly()
@Controller('profiles/:profileId/invites')
export class ProfileInvitesController {
  constructor(private readonly invites: ProfileInvitesService) {}

  @Post()
  @RequireProfileAccess(ProfileAction.MANAGE_MEMBERS)
  @ApiOperation({ summary: 'Invite someone by email (OWNER); valid 7 days' })
  @ApiZodBody(createInviteRequestSchema)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentProfileAccess() access: ProfileAccess,
    @Body(new ZodValidationPipe(createInviteRequestSchema))
    body: CreateInviteRequest,
  ): Promise<ProfileInviteResponse> {
    return this.invites.create(user.userId, access, body);
  }

  @Get()
  @RequireProfileAccess(ProfileAction.MANAGE_MEMBERS)
  @ApiOperation({ summary: 'Pending invites of this profile (OWNER)' })
  list(
    @CurrentProfileAccess() access: ProfileAccess,
  ): Promise<PaginatedResponse<ProfileInviteResponse>> {
    return this.invites.listForProfile(access);
  }

  @Delete(':inviteId')
  @RequireProfileAccess(ProfileAction.MANAGE_MEMBERS)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cancel a pending invite (OWNER)' })
  revoke(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentProfileAccess() access: ProfileAccess,
    @UuidParam('inviteId') inviteId: string,
  ): Promise<void> {
    return this.invites.revoke(user.userId, access, inviteId);
  }
}

/** The invitee's side: invites sent to my email. */
@ApiTags('profile invites')
@ApiBearerAuth()
@RegisteredUsersOnly()
@Controller('me/profile-invites')
export class MyProfileInvitesController {
  constructor(private readonly invites: ProfileInvitesService) {}

  @Get()
  @ApiOperation({ summary: 'Pending invites addressed to my email' })
  list(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PaginatedResponse<ProfileInviteResponse>> {
    return this.invites.listForInvitee(user.userId);
  }

  @Post(':inviteId/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Join the profile; returns it with my new role' })
  accept(
    @CurrentUser() user: AuthenticatedUser,
    @UuidParam('inviteId') inviteId: string,
  ): Promise<PatientProfileResponse> {
    return this.invites.accept(user.userId, inviteId);
  }

  @Post(':inviteId/decline')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Decline the invite' })
  decline(
    @CurrentUser() user: AuthenticatedUser,
    @UuidParam('inviteId') inviteId: string,
  ): Promise<void> {
    return this.invites.decline(user.userId, inviteId);
  }
}
