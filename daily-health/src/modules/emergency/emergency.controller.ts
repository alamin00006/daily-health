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
import { StaffOnly } from '../../common/auth/staff-role.guard.js';
import { UuidParam } from '../../common/pipes/uuid-param.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { ApiZodBody } from '../../common/swagger/api-zod-body.decorator.js';
import {
  paginationQuerySchema,
  type PaginatedResponse,
  type PaginationQuery,
} from '../../shared-contracts/common-fields.contract.js';
import {
  addEmergencyLocationRequestSchema,
  createEmergencyContactRequestSchema,
  createEmergencyRequestSchema,
  handleEmergencyRequestSchema,
  listEmergencyRequestsQuerySchema,
  updateEmergencyContactRequestSchema,
  type AddEmergencyLocationRequest,
  type CreateEmergencyContactRequest,
  type CreateEmergencyRequest,
  type EmergencyContactResponse,
  type EmergencyRequestResponse,
  type HandleEmergencyRequest,
  type ListEmergencyRequestsQuery,
  type RaiseEmergencyResponse,
  type StaffEmergencyRequestResponse,
  type UpdateEmergencyContactRequest,
} from '../../shared-contracts/emergency.contract.js';
import { ProfileAction, type ProfileAccess } from '../users/profile-access.service.js';
import {
  CurrentProfileAccess,
  RequireProfileAccess,
} from '../users/require-profile-access.guard.js';
import { EmergencyContactsService } from './emergency-contacts.service.js';
import { EmergencyRequestsService } from './emergency-requests.service.js';

@ApiTags('emergency')
@ApiBearerAuth()
@RegisteredUsersOnly()
@Controller('profiles/:profileId')
export class ProfileEmergencyController {
  constructor(
    private readonly contacts: EmergencyContactsService,
    private readonly requests: EmergencyRequestsService,
  ) {}

  @Get('emergency-contacts')
  @RequireProfileAccess(ProfileAction.VIEW)
  @ApiOperation({ summary: 'Emergency contacts of a profile' })
  listContacts(@CurrentProfileAccess() access: ProfileAccess): Promise<EmergencyContactResponse[]> {
    return this.contacts.list(access);
  }

  @Post('emergency-contacts')
  @RequireProfileAccess(ProfileAction.EDIT)
  @ApiOperation({ summary: 'Add an emergency contact (at most 5; OWNER, CAREGIVER)' })
  @ApiZodBody(createEmergencyContactRequestSchema)
  createContact(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentProfileAccess() access: ProfileAccess,
    @Body(new ZodValidationPipe(createEmergencyContactRequestSchema)) body: CreateEmergencyContactRequest,
  ): Promise<EmergencyContactResponse> {
    return this.contacts.create(user.userId, access, body);
  }

  @Patch('emergency-contacts/:contactId')
  @RequireProfileAccess(ProfileAction.EDIT)
  @ApiOperation({ summary: 'Change an emergency contact' })
  @ApiZodBody(updateEmergencyContactRequestSchema)
  updateContact(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentProfileAccess() access: ProfileAccess,
    @UuidParam('contactId') contactId: string,
    @Body(new ZodValidationPipe(updateEmergencyContactRequestSchema)) body: UpdateEmergencyContactRequest,
  ): Promise<EmergencyContactResponse> {
    return this.contacts.update(user.userId, access, contactId, body);
  }

  @Delete('emergency-contacts/:contactId')
  @RequireProfileAccess(ProfileAction.EDIT)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove an emergency contact' })
  removeContact(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentProfileAccess() access: ProfileAccess,
    @UuidParam('contactId') contactId: string,
  ): Promise<void> {
    return this.contacts.remove(user.userId, access, contactId);
  }

  @Post('emergency-requests')
  @RequireProfileAccess(ProfileAction.VIEW)
  @ApiOperation({
    summary: 'SOS: alert the family, SMS the contacts, queue it for staff (any member; returns the open one if any)',
  })
  @ApiZodBody(createEmergencyRequestSchema)
  raise(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentProfileAccess() access: ProfileAccess,
    @Body(new ZodValidationPipe(createEmergencyRequestSchema)) body: CreateEmergencyRequest,
  ): Promise<RaiseEmergencyResponse> {
    return this.requests.raise(user.userId, access, body);
  }

  @Get('emergency-requests/active')
  @RequireProfileAccess(ProfileAction.VIEW)
  @ApiOperation({ summary: 'The open or dispatched request, or null' })
  active(@CurrentProfileAccess() access: ProfileAccess): Promise<EmergencyRequestResponse | null> {
    return this.requests.active(access);
  }

  @Get('emergency-requests')
  @RequireProfileAccess(ProfileAction.VIEW)
  @ApiOperation({ summary: 'Past requests, newest first' })
  history(
    @CurrentProfileAccess() access: ProfileAccess,
    @Query(new ZodValidationPipe(paginationQuerySchema)) query: PaginationQuery,
  ): Promise<PaginatedResponse<EmergencyRequestResponse>> {
    return this.requests.history(access, query.cursor, query.limit);
  }

  @Post('emergency-requests/:requestId/location')
  @RequireProfileAccess(ProfileAction.VIEW)
  @ApiOperation({ summary: 'Add the GPS position when it arrives after the SOS (once, while live)' })
  @ApiZodBody(addEmergencyLocationRequestSchema)
  addLocation(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentProfileAccess() access: ProfileAccess,
    @UuidParam('requestId') requestId: string,
    @Body(new ZodValidationPipe(addEmergencyLocationRequestSchema)) body: AddEmergencyLocationRequest,
  ): Promise<EmergencyRequestResponse> {
    return this.requests.addLocation(user.userId, access, requestId, body);
  }

  @Post('emergency-requests/:requestId/cancel')
  @RequireProfileAccess(ProfileAction.VIEW)
  @ApiOperation({ summary: 'Cancel (pressed by mistake, or no longer needed)' })
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentProfileAccess() access: ProfileAccess,
    @UuidParam('requestId') requestId: string,
  ): Promise<EmergencyRequestResponse> {
    return this.requests.cancel(user.userId, access, requestId);
  }
}

@ApiTags('staff: emergency')
@ApiBearerAuth()
@StaffOnly()
@Controller('staff/emergency-requests')
export class StaffEmergencyController {
  constructor(private readonly requests: EmergencyRequestsService) {}

  @Get()
  @ApiOperation({ summary: 'Emergency queue (active) or history (closed), newest first' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(listEmergencyRequestsQuerySchema)) query: ListEmergencyRequestsQuery,
  ): Promise<PaginatedResponse<StaffEmergencyRequestResponse>> {
    return this.requests.staffList(user.userId, query);
  }

  @Get(':requestId')
  @ApiOperation({ summary: 'One request with patient basics, conditions and contacts' })
  get(
    @CurrentUser() user: AuthenticatedUser,
    @UuidParam('requestId') requestId: string,
  ): Promise<StaffEmergencyRequestResponse> {
    return this.requests.staffGet(user.userId, requestId);
  }

  @Post(':requestId/dispatch')
  @ApiOperation({ summary: 'Help is on the way (the family is told, with the note)' })
  @ApiZodBody(handleEmergencyRequestSchema)
  dispatch(
    @CurrentUser() user: AuthenticatedUser,
    @UuidParam('requestId') requestId: string,
    @Body(new ZodValidationPipe(handleEmergencyRequestSchema)) body: HandleEmergencyRequest,
  ): Promise<StaffEmergencyRequestResponse> {
    return this.requests.dispatch(user.userId, requestId, body);
  }

  @Post(':requestId/close')
  @ApiOperation({ summary: 'Close the request' })
  @ApiZodBody(handleEmergencyRequestSchema)
  close(
    @CurrentUser() user: AuthenticatedUser,
    @UuidParam('requestId') requestId: string,
    @Body(new ZodValidationPipe(handleEmergencyRequestSchema)) body: HandleEmergencyRequest,
  ): Promise<StaffEmergencyRequestResponse> {
    return this.requests.close(user.userId, requestId, body);
  }
}
