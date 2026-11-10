import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Query,
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
import {
  createFollowUpRequestSchema,
  listFollowUpsQuerySchema,
  updateFollowUpRequestSchema,
  type CreateFollowUpRequest,
  type FollowUpResponse,
  type ListFollowUpsQuery,
  type UpdateFollowUpRequest,
} from '../../shared-contracts/appointments.contract.js';
import type { PaginatedResponse } from '../../shared-contracts/common-fields.contract.js';
import {
  ProfileAction,
  type ProfileAccess,
} from '../users/profile-access.service.js';
import {
  CurrentProfileAccess,
  RequireProfileAccess,
} from '../users/require-profile-access.guard.js';
import { FollowUpsService } from './follow-ups.service.js';

@ApiTags('appointments: follow-ups')
@ApiBearerAuth()
@RegisteredUsersOnly()
@Controller('profiles/:profileId/follow-ups')
export class FollowUpsController {
  constructor(private readonly followUps: FollowUpsService) {}

  @Get()
  @RequireProfileAccess(ProfileAction.VIEW)
  @ApiOperation({ summary: 'upcoming (soonest first) or past' })
  list(
    @CurrentProfileAccess() access: ProfileAccess,
    @Query(new ZodValidationPipe(listFollowUpsQuerySchema))
    query: ListFollowUpsQuery,
  ): Promise<PaginatedResponse<FollowUpResponse>> {
    return this.followUps.list(access, query);
  }

  @Post()
  @RequireProfileAccess(ProfileAction.EDIT)
  @ApiOperation({
    summary:
      'A follow-up with a doctor outside the app; reminded 24 h and 2 h before (OWNER, CAREGIVER)',
  })
  @ApiZodBody(createFollowUpRequestSchema)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentProfileAccess() access: ProfileAccess,
    @Body(new ZodValidationPipe(createFollowUpRequestSchema))
    body: CreateFollowUpRequest,
  ): Promise<FollowUpResponse> {
    return this.followUps.create(user.userId, access, body);
  }

  @Patch(':followUpId')
  @RequireProfileAccess(ProfileAction.EDIT)
  @ApiOperation({
    summary:
      "Edit, mark done or cancel (a doctor's follow-up: status only) (OWNER, CAREGIVER)",
  })
  @ApiZodBody(updateFollowUpRequestSchema)
  update(
    @CurrentProfileAccess() access: ProfileAccess,
    @UuidParam('followUpId') followUpId: string,
    @Body(new ZodValidationPipe(updateFollowUpRequestSchema))
    body: UpdateFollowUpRequest,
  ): Promise<FollowUpResponse> {
    return this.followUps.update(access, followUpId, body);
  }

  @Delete(':followUpId')
  @RequireProfileAccess(ProfileAction.EDIT)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete one you added (OWNER, CAREGIVER)' })
  remove(
    @CurrentProfileAccess() access: ProfileAccess,
    @UuidParam('followUpId') followUpId: string,
  ): Promise<void> {
    return this.followUps.remove(access, followUpId);
  }
}
