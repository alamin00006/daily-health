import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
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
import { calendarDateSchema } from '../../shared-contracts/common-fields.contract.js';
import {
  createPeriodRequestSchema,
  listDailyLogsQuerySchema,
  saveDailyLogRequestSchema,
  startPregnancyRequestSchema,
  updateCycleSettingsRequestSchema,
  updatePeriodRequestSchema,
  type CreatePeriodRequest,
  type CycleOverviewResponse,
  type CycleSettingsResponse,
  type DailyLogResponse,
  type ListDailyLogsQuery,
  type PeriodResponse,
  type PregnancyResponse,
  type SaveDailyLogRequest,
  type StartPregnancyRequest,
  type UpdateCycleSettingsRequest,
  type UpdatePeriodRequest,
} from '../../shared-contracts/womens-health.contract.js';
import {
  ProfileAction,
  type ProfileAccess,
} from '../users/profile-access.service.js';
import {
  CurrentProfileAccess,
  RequireProfileAccess,
} from '../users/require-profile-access.guard.js';
import { WomensHealthService } from './womens-health.service.js';

/**
 * Every route needs VIEW_WOMENS_HEALTH: the patient's own account, or the
 * OWNER when the patient has none. Caregivers and viewers get 403.
 */
@ApiTags('womens-health')
@ApiBearerAuth()
@RegisteredUsersOnly()
@RequireProfileAccess(ProfileAction.VIEW_WOMENS_HEALTH)
@Controller('profiles/:profileId/womens-health')
export class WomensHealthController {
  constructor(private readonly womensHealth: WomensHealthService) {}

  @Get()
  @ApiOperation({ summary: 'Cycle day, phase, predictions, today’s log and pregnancy' })
  overview(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentProfileAccess() access: ProfileAccess,
  ): Promise<CycleOverviewResponse> {
    return this.womensHealth.overview(user.userId, access);
  }

  @Put('settings')
  @ApiOperation({ summary: 'Cycle and period length, goal, lock flag, reminders' })
  @ApiZodBody(updateCycleSettingsRequestSchema)
  updateSettings(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentProfileAccess() access: ProfileAccess,
    @Body(new ZodValidationPipe(updateCycleSettingsRequestSchema)) body: UpdateCycleSettingsRequest,
  ): Promise<CycleSettingsResponse> {
    return this.womensHealth.updateSettings(user.userId, access, body);
  }

  @Get('periods')
  @ApiOperation({ summary: 'Logged periods, latest first (last 24)' })
  listPeriods(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentProfileAccess() access: ProfileAccess,
  ): Promise<PeriodResponse[]> {
    return this.womensHealth.listPeriods(user.userId, access);
  }

  @Post('periods')
  @ApiOperation({ summary: 'Log a period (end date optional while it goes on)' })
  @ApiZodBody(createPeriodRequestSchema)
  createPeriod(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentProfileAccess() access: ProfileAccess,
    @Body(new ZodValidationPipe(createPeriodRequestSchema)) body: CreatePeriodRequest,
  ): Promise<PeriodResponse> {
    return this.womensHealth.createPeriod(user.userId, access, body);
  }

  @Patch('periods/:periodId')
  @ApiOperation({ summary: 'Change a period’s dates, or end it' })
  @ApiZodBody(updatePeriodRequestSchema)
  updatePeriod(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentProfileAccess() access: ProfileAccess,
    @UuidParam('periodId') periodId: string,
    @Body(new ZodValidationPipe(updatePeriodRequestSchema)) body: UpdatePeriodRequest,
  ): Promise<PeriodResponse> {
    return this.womensHealth.updatePeriod(user.userId, access, periodId, body);
  }

  @Delete('periods/:periodId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a logged period' })
  removePeriod(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentProfileAccess() access: ProfileAccess,
    @UuidParam('periodId') periodId: string,
  ): Promise<void> {
    return this.womensHealth.removePeriod(user.userId, access, periodId);
  }

  @Get('logs')
  @ApiOperation({ summary: 'Daily logs between two dates (at most 92 days)' })
  listLogs(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentProfileAccess() access: ProfileAccess,
    @Query(new ZodValidationPipe(listDailyLogsQuerySchema)) query: ListDailyLogsQuery,
  ): Promise<DailyLogResponse[]> {
    return this.womensHealth.listLogs(user.userId, access, query);
  }

  @Put('logs/:date')
  @ApiOperation({ summary: 'Save a day’s flow, mood, symptoms and note (empty = delete); returns null when cleared' })
  @ApiZodBody(saveDailyLogRequestSchema)
  saveLog(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentProfileAccess() access: ProfileAccess,
    @Param('date', new ZodValidationPipe(calendarDateSchema)) date: string,
    @Body(new ZodValidationPipe(saveDailyLogRequestSchema)) body: SaveDailyLogRequest,
  ): Promise<DailyLogResponse | null> {
    return this.womensHealth.saveLog(user.userId, access, date, body);
  }

  @Post('pregnancy')
  @ApiOperation({ summary: 'Start tracking a pregnancy from the last period date' })
  @ApiZodBody(startPregnancyRequestSchema)
  startPregnancy(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentProfileAccess() access: ProfileAccess,
    @Body(new ZodValidationPipe(startPregnancyRequestSchema)) body: StartPregnancyRequest,
  ): Promise<PregnancyResponse> {
    return this.womensHealth.startPregnancy(user.userId, access, body);
  }

  @Post('pregnancy/end')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Stop tracking the current pregnancy' })
  endPregnancy(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentProfileAccess() access: ProfileAccess,
  ): Promise<void> {
    return this.womensHealth.endPregnancy(user.userId, access);
  }
}
