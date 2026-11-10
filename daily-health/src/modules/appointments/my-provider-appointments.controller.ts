import { Body, Controller, Get, Post, Query } from '@nestjs/common';
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
  completeAppointmentRequestSchema,
  providerCalendarQuerySchema,
  providerCancelAppointmentRequestSchema,
  providerDayQuerySchema,
  type CompleteAppointmentRequest,
  type ProviderAppointmentResponse,
  type ProviderCalendarDayResponse,
  type ProviderCalendarQuery,
  type ProviderCancelAppointmentRequest,
  type ProviderDayQuery,
} from '../../shared-contracts/appointments.contract.js';
import { ProviderAppointmentsService } from './provider-appointments.service.js';

@ApiTags('appointments: provider panel')
@ApiBearerAuth()
@RegisteredUsersOnly()
@Controller('provider/me/appointments')
export class MyProviderAppointmentsController {
  constructor(private readonly appointments: ProviderAppointmentsService) {}

  @Get()
  @ApiOperation({ summary: 'One day (default today) in serial/time order' })
  day(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(providerDayQuerySchema))
    query: ProviderDayQuery,
  ): Promise<ProviderAppointmentResponse[]> {
    return this.appointments.day(user.userId, query.date);
  }

  @Get('calendar')
  @ApiOperation({ summary: 'Counts per day for a calendar' })
  calendar(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(providerCalendarQuerySchema))
    query: ProviderCalendarQuery,
  ): Promise<ProviderCalendarDayResponse[]> {
    return this.appointments.calendar(user.userId, query);
  }

  @Get(':appointmentId')
  @ApiOperation({ summary: 'One appointment with the patient basics' })
  get(
    @CurrentUser() user: AuthenticatedUser,
    @UuidParam('appointmentId') appointmentId: string,
  ): Promise<ProviderAppointmentResponse> {
    return this.appointments.get(user.userId, appointmentId);
  }

  @Post(':appointmentId/complete')
  @ApiOperation({
    summary:
      'Seen: optionally set a follow-up in N days (the family is reminded)',
  })
  @ApiZodBody(completeAppointmentRequestSchema)
  complete(
    @CurrentUser() user: AuthenticatedUser,
    @UuidParam('appointmentId') appointmentId: string,
    @Body(new ZodValidationPipe(completeAppointmentRequestSchema))
    body: CompleteAppointmentRequest,
  ): Promise<ProviderAppointmentResponse> {
    return this.appointments.complete(user.userId, appointmentId, body);
  }

  @Post(':appointmentId/no-show')
  @ApiOperation({ summary: 'The patient did not come' })
  noShow(
    @CurrentUser() user: AuthenticatedUser,
    @UuidParam('appointmentId') appointmentId: string,
  ): Promise<ProviderAppointmentResponse> {
    return this.appointments.markNoShow(user.userId, appointmentId);
  }

  @Post(':appointmentId/cancel')
  @ApiOperation({
    summary: 'Cancel with a reason; the patient gets push and SMS',
  })
  @ApiZodBody(providerCancelAppointmentRequestSchema)
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @UuidParam('appointmentId') appointmentId: string,
    @Body(new ZodValidationPipe(providerCancelAppointmentRequestSchema))
    body: ProviderCancelAppointmentRequest,
  ): Promise<ProviderAppointmentResponse> {
    return this.appointments.cancel(user.userId, appointmentId, body.reason);
  }
}
