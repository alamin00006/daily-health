import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
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
import type { PaginatedResponse } from '../../shared-contracts/common-fields.contract.js';
import type { MedicationPlanResponse } from '../../shared-contracts/medicine.contract.js';
import {
  createAlarmFromItemRequestSchema,
  linkTestResultRequestSchema,
  listPrescriptionsQuerySchema,
  listProviderPrescriptionsQuerySchema,
  revokePrescriptionRequestSchema,
  savePrescriptionDraftRequestSchema,
  startPrescriptionRequestSchema,
  type CreateAlarmFromItemRequest,
  type LinkTestResultRequest,
  type ListPrescriptionsQuery,
  type ListProviderPrescriptionsQuery,
  type PrescriptionResponse,
  type RevokePrescriptionRequest,
  type SavePrescriptionDraftRequest,
  type StartPrescriptionRequest,
} from '../../shared-contracts/prescription.contract.js';
import {
  CurrentProfileAccess,
  RequireProfileAccess,
} from '../users/require-profile-access.guard.js';
import {
  ProfileAction,
  type ProfileAccess,
} from '../users/profile-access.service.js';
import { PatientPrescriptionsService } from './patient-prescriptions.service.js';
import { ProviderPrescriptionsService } from './provider-prescriptions.service.js';

@ApiTags('prescriptions: provider panel')
@ApiBearerAuth()
@RegisteredUsersOnly()
@Controller('provider/me/prescriptions')
export class ProviderPrescriptionsController {
  constructor(private readonly prescriptions: ProviderPrescriptionsService) {}

  @Get()
  @ApiOperation({ summary: 'My prescriptions, newest first; filter by status' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(listProviderPrescriptionsQuerySchema))
    query: ListProviderPrescriptionsQuery,
  ): Promise<PaginatedResponse<PrescriptionResponse>> {
    return this.prescriptions.list(user.userId, query);
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Open the prescription of a visit or consultation: the existing draft/issued one, or a new draft',
  })
  @ApiZodBody(startPrescriptionRequestSchema)
  start(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(startPrescriptionRequestSchema)) body: StartPrescriptionRequest,
  ): Promise<PrescriptionResponse> {
    return this.prescriptions.start(user.userId, body);
  }

  @Get(':prescriptionId')
  @ApiOperation({ summary: 'One of my prescriptions' })
  get(
    @CurrentUser() user: AuthenticatedUser,
    @UuidParam('prescriptionId') prescriptionId: string,
  ): Promise<PrescriptionResponse> {
    return this.prescriptions.get(user.userId, prescriptionId);
  }

  @Put(':prescriptionId')
  @ApiOperation({ summary: 'Save the draft (replaces fields, medicines and tests)' })
  @ApiZodBody(savePrescriptionDraftRequestSchema)
  save(
    @CurrentUser() user: AuthenticatedUser,
    @UuidParam('prescriptionId') prescriptionId: string,
    @Body(new ZodValidationPipe(savePrescriptionDraftRequestSchema)) body: SavePrescriptionDraftRequest,
  ): Promise<PrescriptionResponse> {
    return this.prescriptions.save(user.userId, prescriptionId, body);
  }

  @Post(':prescriptionId/issue')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Issue the draft: fixed from now on, the family is told' })
  issue(
    @CurrentUser() user: AuthenticatedUser,
    @UuidParam('prescriptionId') prescriptionId: string,
  ): Promise<PrescriptionResponse> {
    return this.prescriptions.issue(user.userId, prescriptionId);
  }

  @Post(':prescriptionId/revoke')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke an issued prescription with a reason (then write a new one)' })
  @ApiZodBody(revokePrescriptionRequestSchema)
  revoke(
    @CurrentUser() user: AuthenticatedUser,
    @UuidParam('prescriptionId') prescriptionId: string,
    @Body(new ZodValidationPipe(revokePrescriptionRequestSchema)) body: RevokePrescriptionRequest,
  ): Promise<PrescriptionResponse> {
    return this.prescriptions.revoke(user.userId, prescriptionId, body);
  }

  @Delete(':prescriptionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a draft' })
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @UuidParam('prescriptionId') prescriptionId: string,
  ): Promise<void> {
    await this.prescriptions.removeDraft(user.userId, prescriptionId);
  }
}

@ApiTags('prescriptions')
@ApiBearerAuth()
@RegisteredUsersOnly()
@Controller('profiles/:profileId/prescriptions')
export class ProfilePrescriptionsController {
  constructor(private readonly prescriptions: PatientPrescriptionsService) {}

  @Get()
  @RequireProfileAccess(ProfileAction.VIEW)
  @ApiOperation({ summary: 'Issued and revoked prescriptions, newest first' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentProfileAccess() access: ProfileAccess,
    @Query(new ZodValidationPipe(listPrescriptionsQuerySchema)) query: ListPrescriptionsQuery,
  ): Promise<PaginatedResponse<PrescriptionResponse>> {
    return this.prescriptions.list(user.userId, access, query);
  }

  @Get(':prescriptionId')
  @RequireProfileAccess(ProfileAction.VIEW)
  @ApiOperation({ summary: 'One prescription with the alarms made from it' })
  get(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentProfileAccess() access: ProfileAccess,
    @UuidParam('prescriptionId') prescriptionId: string,
  ): Promise<PrescriptionResponse> {
    return this.prescriptions.get(user.userId, access, prescriptionId);
  }

  @Post(':prescriptionId/items/:itemId/alarm')
  @RequireProfileAccess(ProfileAction.EDIT)
  @ApiOperation({
    summary: 'Make a medicine alarm from one medicine line (1+0+½ → 08:00 ×1, 21:00 ×½)',
  })
  @ApiZodBody(createAlarmFromItemRequestSchema)
  createAlarm(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentProfileAccess() access: ProfileAccess,
    @UuidParam('prescriptionId') prescriptionId: string,
    @UuidParam('itemId') itemId: string,
    @Body(new ZodValidationPipe(createAlarmFromItemRequestSchema)) body: CreateAlarmFromItemRequest,
  ): Promise<MedicationPlanResponse> {
    return this.prescriptions.createAlarm(user.userId, access, prescriptionId, itemId, body);
  }

  @Put(':prescriptionId/tests/:testId/result')
  @RequireProfileAccess(ProfileAction.EDIT)
  @ApiOperation({ summary: 'Link an uploaded report to a prescribed test (null to unlink)' })
  @ApiZodBody(linkTestResultRequestSchema)
  linkTestResult(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentProfileAccess() access: ProfileAccess,
    @UuidParam('prescriptionId') prescriptionId: string,
    @UuidParam('testId') testId: string,
    @Body(new ZodValidationPipe(linkTestResultRequestSchema)) body: LinkTestResultRequest,
  ): Promise<PrescriptionResponse> {
    return this.prescriptions.linkTestResult(user.userId, access, prescriptionId, testId, body);
  }
}
