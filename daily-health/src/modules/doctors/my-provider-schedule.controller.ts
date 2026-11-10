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
import {
  createChamberRequestSchema,
  createScheduleExceptionRequestSchema,
  createScheduleRequestSchema,
  listScheduleExceptionsQuerySchema,
  updateChamberRequestSchema,
  updateScheduleRequestSchema,
  type CreateChamberRequest,
  type CreateScheduleExceptionRequest,
  type CreateScheduleRequest,
  type MyProviderProfileResponse,
  type ScheduleExceptionResponse,
  type UpdateChamberRequest,
  type UpdateScheduleRequest,
} from '../../shared-contracts/doctors.contract.js';
import { ProviderSchedulesService } from './provider-schedules.service.js';

/** Chambers, weekly sessions and days off (web panel). */
@ApiTags('doctors: my schedule')
@ApiBearerAuth()
@RegisteredUsersOnly()
@Controller('provider/me')
export class MyProviderScheduleController {
  constructor(private readonly schedules: ProviderSchedulesService) {}

  @Post('chambers')
  @ApiOperation({ summary: 'Add a chamber at a hospital with its fee' })
  @ApiZodBody(createChamberRequestSchema)
  createChamber(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createChamberRequestSchema))
    body: CreateChamberRequest,
  ): Promise<MyProviderProfileResponse> {
    return this.schedules.createChamber(user.userId, body);
  }

  @Patch('chambers/:chamberId')
  @ApiOperation({ summary: 'Change room or fees, or turn the chamber off/on' })
  @ApiZodBody(updateChamberRequestSchema)
  updateChamber(
    @CurrentUser() user: AuthenticatedUser,
    @UuidParam('chamberId') chamberId: string,
    @Body(new ZodValidationPipe(updateChamberRequestSchema))
    body: UpdateChamberRequest,
  ): Promise<MyProviderProfileResponse> {
    return this.schedules.updateChamber(user.userId, chamberId, body);
  }

  @Post('schedules')
  @ApiOperation({
    summary:
      'Weekly sessions: IN_PERSON serials at a chamber, or VIDEO/CHAT/HOME_VISIT time slots; one per selected day',
  })
  @ApiZodBody(createScheduleRequestSchema)
  createSchedules(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createScheduleRequestSchema))
    body: CreateScheduleRequest,
  ): Promise<MyProviderProfileResponse> {
    return this.schedules.createSchedules(user.userId, body);
  }

  @Patch('schedules/:scheduleId')
  @ApiOperation({
    summary: 'Change hours, cap or slot length, or turn it off/on',
  })
  @ApiZodBody(updateScheduleRequestSchema)
  updateSchedule(
    @CurrentUser() user: AuthenticatedUser,
    @UuidParam('scheduleId') scheduleId: string,
    @Body(new ZodValidationPipe(updateScheduleRequestSchema))
    body: UpdateScheduleRequest,
  ): Promise<MyProviderProfileResponse> {
    return this.schedules.updateSchedule(user.userId, scheduleId, body);
  }

  @Delete('schedules/:scheduleId')
  @ApiOperation({
    summary:
      'Stop a weekly session (existing bookings stay; cancel them separately)',
  })
  removeSchedule(
    @CurrentUser() user: AuthenticatedUser,
    @UuidParam('scheduleId') scheduleId: string,
  ): Promise<MyProviderProfileResponse> {
    return this.schedules.removeSchedule(user.userId, scheduleId);
  }

  @Get('schedule-exceptions')
  @ApiOperation({
    summary: 'Days off and changed hours from a date (default today)',
  })
  listExceptions(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(listScheduleExceptionsQuerySchema))
    query: z.output<typeof listScheduleExceptionsQuerySchema>,
  ): Promise<ScheduleExceptionResponse[]> {
    return this.schedules.listExceptions(user.userId, query.from);
  }

  @Post('schedule-exceptions')
  @ApiOperation({
    summary: 'A day off (whole day or one session) or changed hours',
  })
  @ApiZodBody(createScheduleExceptionRequestSchema)
  createException(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createScheduleExceptionRequestSchema))
    body: CreateScheduleExceptionRequest,
  ): Promise<ScheduleExceptionResponse> {
    return this.schedules.createException(user.userId, body);
  }

  @Delete('schedule-exceptions/:exceptionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Undo a day off or changed hours' })
  removeException(
    @CurrentUser() user: AuthenticatedUser,
    @UuidParam('exceptionId') exceptionId: string,
  ): Promise<void> {
    return this.schedules.removeException(user.userId, exceptionId);
  }
}
