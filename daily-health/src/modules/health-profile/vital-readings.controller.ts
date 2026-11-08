import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
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
import type { PaginatedResponse } from '../../shared-contracts/common-fields.contract.js';
import {
  createVitalRequestSchema,
  listVitalsQuerySchema,
  type CreateVitalRequest,
  type LatestVitalsResponse,
  type ListVitalsQuery,
  type VitalReadingResponse,
} from '../../shared-contracts/health.contract.js';
import {
  ProfileAction,
  type ProfileAccess,
} from '../users/profile-access.service.js';
import {
  CurrentProfileAccess,
  RequireProfileAccess,
} from '../users/require-profile-access.guard.js';
import { VitalReadingsService } from './vital-readings.service.js';

@ApiTags('health: vitals')
@ApiBearerAuth()
@RegisteredUsersOnly()
@Controller('profiles/:profileId/vitals')
export class VitalReadingsController {
  constructor(private readonly vitals: VitalReadingsService) {}

  @Post()
  @RequireProfileAccess(ProfileAction.EDIT)
  @ApiOperation({
    summary:
      'Record BP, glucose, weight, pulse, temperature or SpO2; status is computed (OWNER, CAREGIVER)',
  })
  @ApiZodBody(createVitalRequestSchema)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentProfileAccess() access: ProfileAccess,
    @Body(new ZodValidationPipe(createVitalRequestSchema))
    body: CreateVitalRequest,
  ): Promise<VitalReadingResponse> {
    return this.vitals.create(user.userId, access, body);
  }

  @Get()
  @RequireProfileAccess(ProfileAction.VIEW)
  @ApiOperation({
    summary: 'Readings, newest first; filter by type and time range for charts',
  })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentProfileAccess() access: ProfileAccess,
    @Query(new ZodValidationPipe(listVitalsQuerySchema)) query: ListVitalsQuery,
  ): Promise<PaginatedResponse<VitalReadingResponse>> {
    return this.vitals.list(user.userId, access, query);
  }

  @Get('latest')
  @RequireProfileAccess(ProfileAction.VIEW)
  @ApiOperation({ summary: 'The newest reading of each type' })
  latest(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentProfileAccess() access: ProfileAccess,
  ): Promise<LatestVitalsResponse> {
    return this.vitals.latest(user.userId, access);
  }

  @Delete(':readingId')
  @RequireProfileAccess(ProfileAction.EDIT)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a wrong reading (OWNER, CAREGIVER)' })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentProfileAccess() access: ProfileAccess,
    @UuidParam('readingId') readingId: string,
  ): Promise<void> {
    return this.vitals.remove(user.userId, access, readingId);
  }
}
