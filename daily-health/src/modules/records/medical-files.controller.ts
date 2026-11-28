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
  UploadedFile,
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
import {
  requireUploadedFile,
  SingleFileUpload,
  type UploadedMultipartFile,
} from '../../core/uploads/single-file-upload.decorator.js';
import type { PaginatedResponse } from '../../shared-contracts/common-fields.contract.js';
import {
  listMedicalFilesQuerySchema,
  updateMedicalFileRequestSchema,
  uploadMedicalFileFieldsSchema,
  type LabTestSummaryResponse,
  type ListMedicalFilesQuery,
  type MedicalFileResponse,
  type UpdateMedicalFileRequest,
  type UploadMedicalFileFields,
} from '../../shared-contracts/records.contract.js';
import {
  ProfileAction,
  type ProfileAccess,
} from '../users/profile-access.service.js';
import {
  CurrentProfileAccess,
  RequireProfileAccess,
} from '../users/require-profile-access.guard.js';
import { MedicalFilesService } from './medical-files.service.js';

@ApiTags('records: lab reports & prescriptions')
@ApiBearerAuth()
@RegisteredUsersOnly()
@Controller('profiles/:profileId/files')
export class MedicalFilesController {
  constructor(private readonly files: MedicalFilesService) {}

  @Post()
  @RequireProfileAccess(ProfileAction.EDIT)
  @SingleFileUpload(uploadMedicalFileFieldsSchema)
  @ApiOperation({
    summary:
      'Upload a report or prescription: JPEG/PNG/WebP (stored as WebP) or PDF; reports and prescriptions up to 5 MB with all details but the note, other files 10 MB (OWNER, CAREGIVER)',
  })
  upload(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentProfileAccess() access: ProfileAccess,
    @UploadedFile() file: UploadedMultipartFile | undefined,
    @Body(new ZodValidationPipe(uploadMedicalFileFieldsSchema))
    fields: UploadMedicalFileFields,
  ): Promise<MedicalFileResponse> {
    return this.files.upload(
      user.userId,
      access,
      requireUploadedFile(file).buffer,
      fields,
    );
  }

  @Get()
  @RequireProfileAccess(ProfileAction.VIEW)
  @ApiOperation({ summary: 'Files, newest first; filter by type' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentProfileAccess() access: ProfileAccess,
    @Query(new ZodValidationPipe(listMedicalFilesQuerySchema))
    query: ListMedicalFilesQuery,
  ): Promise<PaginatedResponse<MedicalFileResponse>> {
    return this.files.list(user.userId, access, query);
  }

  // Declared before ':fileId' so "tests" is not read as a file id.
  @Get('tests')
  @RequireProfileAccess(ProfileAction.VIEW)
  @ApiOperation({ summary: 'Lab reports grouped by test, newest first' })
  tests(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentProfileAccess() access: ProfileAccess,
  ): Promise<LabTestSummaryResponse[]> {
    return this.files.testSummary(user.userId, access);
  }

  @Get(':fileId')
  @RequireProfileAccess(ProfileAction.VIEW)
  @ApiOperation({ summary: 'One file with fresh signed URLs' })
  get(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentProfileAccess() access: ProfileAccess,
    @UuidParam('fileId') fileId: string,
  ): Promise<MedicalFileResponse> {
    return this.files.get(user.userId, access, fileId);
  }

  @Patch(':fileId')
  @RequireProfileAccess(ProfileAction.EDIT)
  @ApiOperation({
    summary: 'Change the title, test, report date or details (OWNER, CAREGIVER)',
  })
  @ApiZodBody(updateMedicalFileRequestSchema)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentProfileAccess() access: ProfileAccess,
    @UuidParam('fileId') fileId: string,
    @Body(new ZodValidationPipe(updateMedicalFileRequestSchema))
    body: UpdateMedicalFileRequest,
  ): Promise<MedicalFileResponse> {
    return this.files.update(user.userId, access, fileId, body);
  }

  @Delete(':fileId')
  @RequireProfileAccess(ProfileAction.EDIT)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a file (OWNER, CAREGIVER)' })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentProfileAccess() access: ProfileAccess,
    @UuidParam('fileId') fileId: string,
  ): Promise<void> {
    return this.files.remove(user.userId, access, fileId);
  }
}
