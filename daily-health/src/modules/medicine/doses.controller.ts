import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import {
  CurrentUser,
  RegisteredUsersOnly,
} from '../../common/auth/auth-route.decorators.js';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { ApiZodBody } from '../../common/swagger/api-zod-body.decorator.js';
import {
  adherenceQuerySchema,
  daySchedulesQuerySchema,
  recordDoseRequestSchema,
  type AdherenceResponse,
  type DayScheduleResponse,
  type DoseSlotResponse,
  type RecordDoseRequest,
} from '../../shared-contracts/medicine.contract.js';
import {
  ProfileAction,
  type ProfileAccess,
} from '../users/profile-access.service.js';
import {
  CurrentProfileAccess,
  RequireProfileAccess,
} from '../users/require-profile-access.guard.js';
import { DoseLogsService } from './dose-logs.service.js';

@ApiTags('medicine: doses')
@ApiBearerAuth()
@RegisteredUsersOnly()
@Controller('profiles/:profileId')
export class DosesController {
  constructor(private readonly doseLogs: DoseLogsService) {}

  @Get('doses')
  @RequireProfileAccess(ProfileAction.VIEW)
  @ApiOperation({
    summary:
      "A day's doses with their state (UPCOMING/DUE/SNOOZED/TAKEN/SKIPPED/MISSED) and a summary",
  })
  day(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentProfileAccess() access: ProfileAccess,
    @Query(new ZodValidationPipe(daySchedulesQuerySchema))
    query: z.infer<typeof daySchedulesQuerySchema>,
  ): Promise<DayScheduleResponse> {
    return this.doseLogs.daySchedule(user.userId, access, query.date);
  }

  @Post('doses')
  @RequireProfileAccess(ProfileAction.EDIT)
  @ApiOperation({
    summary:
      'Mark a dose taken, skipped or snoozed (PENDING undoes); works for doses marked offline (OWNER, CAREGIVER)',
  })
  @ApiZodBody(recordDoseRequestSchema)
  record(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentProfileAccess() access: ProfileAccess,
    @Body(new ZodValidationPipe(recordDoseRequestSchema))
    body: RecordDoseRequest,
  ): Promise<DoseSlotResponse> {
    return this.doseLogs.record(user.userId, access, body);
  }

  @Get('medicine/adherence')
  @RequireProfileAccess(ProfileAction.VIEW)
  @ApiOperation({ summary: 'Doses taken vs scheduled over the last N days' })
  adherence(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentProfileAccess() access: ProfileAccess,
    @Query(new ZodValidationPipe(adherenceQuerySchema))
    query: z.infer<typeof adherenceQuerySchema>,
  ): Promise<AdherenceResponse> {
    return this.doseLogs.adherence(user.userId, access, query.days);
  }
}
