import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Put,
  UploadedFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  RegisteredUsersOnly,
} from '../../common/auth/auth-route.decorators.js';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { ApiZodBody } from '../../common/swagger/api-zod-body.decorator.js';
import {
  requireUploadedFile,
  SingleFileUpload,
  type UploadedMultipartFile,
} from '../../core/uploads/single-file-upload.decorator.js';
import type { PaginatedResponse } from '../../shared-contracts/common-fields.contract.js';
import {
  createProfileRequestSchema,
  updateProfileRequestSchema,
  type CreateProfileRequest,
  type PatientProfileResponse,
  type UpdateProfileRequest,
} from '../../shared-contracts/profiles.contract.js';
import { PatientProfilesService } from './patient-profiles.service.js';
import { ProfileAction, type ProfileAccess } from './profile-access.service.js';
import {
  CurrentProfileAccess,
  RequireProfileAccess,
} from './require-profile-access.guard.js';

@ApiTags('profiles')
@ApiBearerAuth()
@RegisteredUsersOnly()
@Controller('profiles')
export class PatientProfilesController {
  constructor(private readonly profiles: PatientProfilesService) {}

  @Post()
  @ApiOperation({
    summary:
      'Create a profile (own, parent, child...); the caller becomes OWNER',
  })
  @ApiZodBody(createProfileRequestSchema)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createProfileRequestSchema))
    body: CreateProfileRequest,
  ): Promise<PatientProfileResponse> {
    return this.profiles.create(user.userId, body);
  }

  @Get()
  @ApiOperation({ summary: 'Profiles I can access, own profile first' })
  list(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PaginatedResponse<PatientProfileResponse>> {
    return this.profiles.listForUser(user.userId);
  }

  @Get(':profileId')
  @RequireProfileAccess(ProfileAction.VIEW)
  @ApiOperation({ summary: 'One profile (any member)' })
  get(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentProfileAccess() access: ProfileAccess,
  ): PatientProfileResponse {
    return this.profiles.view(user.userId, access);
  }

  @Patch(':profileId')
  @RequireProfileAccess(ProfileAction.EDIT)
  @ApiOperation({ summary: 'Edit profile details (OWNER, CAREGIVER)' })
  @ApiZodBody(updateProfileRequestSchema)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentProfileAccess() access: ProfileAccess,
    @Body(new ZodValidationPipe(updateProfileRequestSchema))
    body: UpdateProfileRequest,
  ): Promise<PatientProfileResponse> {
    return this.profiles.update(user.userId, access, body);
  }

  @Put(':profileId/avatar')
  @RequireProfileAccess(ProfileAction.EDIT)
  @SingleFileUpload()
  @ApiOperation({
    summary:
      'Set the profile photo (JPEG/PNG/WebP; cropped square) (OWNER, CAREGIVER)',
  })
  setAvatar(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentProfileAccess() access: ProfileAccess,
    @UploadedFile() file: UploadedMultipartFile | undefined,
  ): Promise<PatientProfileResponse> {
    return this.profiles.setAvatar(
      user.userId,
      access,
      requireUploadedFile(file).buffer,
    );
  }

  @Delete(':profileId/avatar')
  @RequireProfileAccess(ProfileAction.EDIT)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove the profile photo (OWNER, CAREGIVER)' })
  removeAvatar(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentProfileAccess() access: ProfileAccess,
  ): Promise<void> {
    return this.profiles.removeAvatar(user.userId, access);
  }

  @Delete(':profileId')
  @RequireProfileAccess(ProfileAction.DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete the profile (OWNER)' })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentProfileAccess() access: ProfileAccess,
  ): Promise<void> {
    return this.profiles.softDelete(user.userId, access);
  }
}
