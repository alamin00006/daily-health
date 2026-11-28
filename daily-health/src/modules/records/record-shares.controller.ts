import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
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
  createRecordShareRequestSchema,
  sharedFilesQuerySchema,
  type CreateRecordShareRequest,
  type MedicalFileResponse,
  type RecordShareResponse,
  type SharedFilesQuery,
  type SharedPatientResponse,
} from '../../shared-contracts/records.contract.js';
import {
  ProfileAction,
  type ProfileAccess,
} from '../users/profile-access.service.js';
import {
  CurrentProfileAccess,
  RequireProfileAccess,
} from '../users/require-profile-access.guard.js';
import { RecordSharesService } from './record-shares.service.js';

@ApiTags('records: sharing with a doctor')
@ApiBearerAuth()
@RegisteredUsersOnly()
@Controller('profiles/:profileId/record-shares')
export class ProfileRecordSharesController {
  constructor(private readonly shares: RecordSharesService) {}

  @Post()
  @RequireProfileAccess(ProfileAction.EDIT)
  @ApiOperation({
    summary: 'Let a doctor see all reports and prescriptions for 1, 7, 30 or 90 days (OWNER, CAREGIVER)',
  })
  @ApiZodBody(createRecordShareRequestSchema)
  share(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentProfileAccess() access: ProfileAccess,
    @Body(new ZodValidationPipe(createRecordShareRequestSchema)) body: CreateRecordShareRequest,
  ): Promise<RecordShareResponse> {
    return this.shares.share(user.userId, access, body);
  }

  @Get()
  @RequireProfileAccess(ProfileAction.VIEW)
  @ApiOperation({ summary: 'Who this profile shared its files with (live and past)' })
  list(@CurrentProfileAccess() access: ProfileAccess): Promise<RecordShareResponse[]> {
    return this.shares.listForProfile(access);
  }

  @Delete(':shareId')
  @RequireProfileAccess(ProfileAction.EDIT)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Take a share back now (OWNER, CAREGIVER)' })
  revoke(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentProfileAccess() access: ProfileAccess,
    @UuidParam('shareId') shareId: string,
  ): Promise<void> {
    return this.shares.revoke(user.userId, access, shareId);
  }
}

@ApiTags('provider: shared records')
@ApiBearerAuth()
@RegisteredUsersOnly()
@Controller('provider/me/shared-records')
export class ProviderSharedRecordsController {
  constructor(private readonly shares: RecordSharesService) {}

  @Get()
  @ApiOperation({ summary: 'Patients who shared their files with me (live shares)' })
  patients(@CurrentUser() user: AuthenticatedUser): Promise<SharedPatientResponse[]> {
    return this.shares.sharedWithMe(user.userId);
  }

  @Get(':patientId/files')
  @ApiOperation({ summary: "A sharing patient's reports and prescriptions, newest first" })
  files(
    @CurrentUser() user: AuthenticatedUser,
    @UuidParam('patientId') patientId: string,
    @Query(new ZodValidationPipe(sharedFilesQuerySchema)) query: SharedFilesQuery,
  ): Promise<PaginatedResponse<MedicalFileResponse>> {
    return this.shares.sharedFiles(user.userId, patientId, query);
  }
}
