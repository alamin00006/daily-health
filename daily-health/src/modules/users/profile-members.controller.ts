import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
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
  updateMemberRequestSchema,
  type ProfileMemberResponse,
  type UpdateMemberRequest,
} from '../../shared-contracts/profiles.contract.js';
import { ProfileAction, type ProfileAccess } from './profile-access.service.js';
import { ProfileMembersService } from './profile-members.service.js';
import {
  CurrentProfileAccess,
  RequireProfileAccess,
} from './require-profile-access.guard.js';

@ApiTags('profile members')
@ApiBearerAuth()
@RegisteredUsersOnly()
@Controller('profiles/:profileId/members')
export class ProfileMembersController {
  constructor(private readonly members: ProfileMembersService) {}

  @Get()
  @RequireProfileAccess(ProfileAction.VIEW)
  @ApiOperation({ summary: 'Who can access this profile' })
  list(
    @CurrentProfileAccess() access: ProfileAccess,
  ): Promise<PaginatedResponse<ProfileMemberResponse>> {
    return this.members.list(access);
  }

  @Patch(':userId')
  @RequireProfileAccess(ProfileAction.VIEW)
  @ApiOperation({
    summary: 'Change a member',
    description:
      'role: OWNER only. relation and receivesAlerts: the member themself.',
  })
  @ApiZodBody(updateMemberRequestSchema)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentProfileAccess() access: ProfileAccess,
    @UuidParam('userId') targetUserId: string,
    @Body(new ZodValidationPipe(updateMemberRequestSchema))
    body: UpdateMemberRequest,
  ): Promise<ProfileMemberResponse> {
    return this.members.update(user.userId, access, targetUserId, body);
  }

  @Delete(':userId')
  @RequireProfileAccess(ProfileAction.VIEW)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a member (OWNER) or leave (yourself)' })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentProfileAccess() access: ProfileAccess,
    @UuidParam('userId') targetUserId: string,
  ): Promise<void> {
    return this.members.remove(user.userId, access, targetUserId);
  }
}
