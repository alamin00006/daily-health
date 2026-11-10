import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  PublicRoute,
  RegisteredUsersOnly,
} from '../../common/auth/auth-route.decorators.js';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.js';
import { UuidParam } from '../../common/pipes/uuid-param.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { ApiZodBody } from '../../common/swagger/api-zod-body.decorator.js';
import {
  availabilityQuerySchema,
  bookAppointmentRequestSchema,
  cancelAppointmentRequestSchema,
  listAppointmentsQuerySchema,
  reviewAppointmentRequestSchema,
  type AppointmentResponse,
  type AvailabilityDayResponse,
  type AvailabilityQuery,
  type BookAppointmentRequest,
  type CancelAppointmentRequest,
  type ListAppointmentsQuery,
  type ReviewAppointmentRequest,
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
import { AppointmentAvailabilityService } from './appointment-availability.service.js';
import { AppointmentBookingService } from './appointment-booking.service.js';
import { PatientAppointmentsService } from './patient-appointments.service.js';

@ApiTags('appointments: availability')
@Controller('providers/:providerId/availability')
export class ProviderAvailabilityController {
  constructor(private readonly availability: AppointmentAvailabilityService) {}

  @Get()
  @PublicRoute()
  @ApiOperation({
    summary:
      'Bookable sessions per day: serials left at chambers, free time slots online',
  })
  get(
    @UuidParam('providerId') providerId: string,
    @Query(new ZodValidationPipe(availabilityQuerySchema))
    query: AvailabilityQuery,
  ): Promise<AvailabilityDayResponse[]> {
    return this.availability.availability(providerId, query);
  }
}

@ApiTags('appointments: patient')
@ApiBearerAuth()
@RegisteredUsersOnly()
@Controller('profiles/:profileId/appointments')
export class ProfileAppointmentsController {
  constructor(
    private readonly booking: AppointmentBookingService,
    private readonly appointments: PatientAppointmentsService,
  ) {}

  @Post()
  @RequireProfileAccess(ProfileAction.EDIT)
  @ApiOperation({
    summary:
      'Book a serial or time slot. Paid bookings hold it for 10 minutes as PENDING_PAYMENT (OWNER, CAREGIVER)',
  })
  @ApiZodBody(bookAppointmentRequestSchema)
  book(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentProfileAccess() access: ProfileAccess,
    @Body(new ZodValidationPipe(bookAppointmentRequestSchema))
    body: BookAppointmentRequest,
  ): Promise<AppointmentResponse> {
    return this.booking.book(user.userId, access, body);
  }

  @Get()
  @RequireProfileAccess(ProfileAction.VIEW)
  @ApiOperation({
    summary: 'upcoming (soonest first) or past (newest first)',
  })
  list(
    @CurrentProfileAccess() access: ProfileAccess,
    @Query(new ZodValidationPipe(listAppointmentsQuerySchema))
    query: ListAppointmentsQuery,
  ): Promise<PaginatedResponse<AppointmentResponse>> {
    return this.appointments.list(access, query);
  }

  @Get(':appointmentId')
  @RequireProfileAccess(ProfileAction.VIEW)
  @ApiOperation({ summary: 'One appointment' })
  get(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentProfileAccess() access: ProfileAccess,
    @UuidParam('appointmentId') appointmentId: string,
  ): Promise<AppointmentResponse> {
    return this.appointments.get(user.userId, access, appointmentId);
  }

  @Post(':appointmentId/cancel')
  @RequireProfileAccess(ProfileAction.EDIT)
  @ApiOperation({
    summary:
      'Cancel: any time while waiting for payment, until 2 hours before once confirmed (OWNER, CAREGIVER)',
  })
  @ApiZodBody(cancelAppointmentRequestSchema)
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentProfileAccess() access: ProfileAccess,
    @UuidParam('appointmentId') appointmentId: string,
    @Body(new ZodValidationPipe(cancelAppointmentRequestSchema))
    body: CancelAppointmentRequest,
  ): Promise<AppointmentResponse> {
    return this.appointments.cancel(user.userId, access, appointmentId, body);
  }

  @Post(':appointmentId/review')
  @RequireProfileAccess(ProfileAction.EDIT)
  @ApiOperation({ summary: 'Rate a completed visit, once (OWNER, CAREGIVER)' })
  @ApiZodBody(reviewAppointmentRequestSchema)
  review(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentProfileAccess() access: ProfileAccess,
    @UuidParam('appointmentId') appointmentId: string,
    @Body(new ZodValidationPipe(reviewAppointmentRequestSchema))
    body: ReviewAppointmentRequest,
  ): Promise<AppointmentResponse> {
    return this.appointments.review(user.userId, access, appointmentId, body);
  }
}
