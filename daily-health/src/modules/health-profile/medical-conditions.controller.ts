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
import type { z } from 'zod';
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
  createConditionRequestSchema,
  listConditionsQuerySchema,
  updateConditionRequestSchema,
  type CreateConditionRequest,
  type MedicalConditionResponse,
  type UpdateConditionRequest,
} from '../../shared-contracts/health.contract.js';
import {
  ProfileAction,
  type ProfileAccess,
} from '../users/profile-access.service.js';
import {
  CurrentProfileAccess,
  RequireProfileAccess,
} from '../users/require-profile-access.guard.js';
import { MedicalConditionsService } from './medical-conditions.service.js';

@ApiTags('health: conditions & allergies')
@ApiBearerAuth()
@RegisteredUsersOnly()
@Controller('profiles/:profileId/conditions')
export class MedicalConditionsController {
  constructor(private readonly conditions: MedicalConditionsService) {}

  @Post()
  @RequireProfileAccess(ProfileAction.EDIT)
  @ApiOperation({
    summary: 'Add a chronic condition, allergy or surgery (OWNER, CAREGIVER)',
  })
  @ApiZodBody(createConditionRequestSchema)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentProfileAccess() access: ProfileAccess,
    @Body(new ZodValidationPipe(createConditionRequestSchema))
    body: CreateConditionRequest,
  ): Promise<MedicalConditionResponse> {
    return this.conditions.create(user.userId, access, body);
  }

  @Get()
  @RequireProfileAccess(ProfileAction.VIEW)
  @ApiOperation({ summary: 'All conditions, chronic first; filter by kind' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentProfileAccess() access: ProfileAccess,
    @Query(new ZodValidationPipe(listConditionsQuerySchema))
    query: z.infer<typeof listConditionsQuerySchema>,
  ): Promise<PaginatedResponse<MedicalConditionResponse>> {
    return this.conditions.list(user.userId, access, query.kind);
  }

  @Patch(':conditionId')
  @RequireProfileAccess(ProfileAction.EDIT)
  @ApiOperation({ summary: 'Edit a condition (OWNER, CAREGIVER)' })
  @ApiZodBody(updateConditionRequestSchema)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentProfileAccess() access: ProfileAccess,
    @UuidParam('conditionId') conditionId: string,
    @Body(new ZodValidationPipe(updateConditionRequestSchema))
    body: UpdateConditionRequest,
  ): Promise<MedicalConditionResponse> {
    return this.conditions.update(user.userId, access, conditionId, body);
  }

  @Delete(':conditionId')
  @RequireProfileAccess(ProfileAction.EDIT)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a condition (OWNER, CAREGIVER)' })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentProfileAccess() access: ProfileAccess,
    @UuidParam('conditionId') conditionId: string,
  ): Promise<void> {
    return this.conditions.remove(user.userId, access, conditionId);
  }
}
