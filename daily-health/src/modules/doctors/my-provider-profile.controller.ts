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
import { UuidParam } from '../../common/pipes/uuid-param.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { ApiZodBody } from '../../common/swagger/api-zod-body.decorator.js';
import {
  requireUploadedFile,
  SingleFileUpload,
  type UploadedMultipartFile,
} from '../../core/uploads/single-file-upload.decorator.js';
import {
  registerProviderRequestSchema,
  setOnlineRequestSchema,
  updateProviderRequestSchema,
  uploadVerificationDocFieldsSchema,
  type MyProviderProfileResponse,
  type RegisterProviderRequest,
  type SetOnlineRequest,
  type UpdateProviderRequest,
  type UploadVerificationDocFields,
} from '../../shared-contracts/doctors.contract.js';
import { ProviderProfileService } from './provider-profile.service.js';

/** The provider's own profile (web panel). */
@ApiTags('doctors: my provider profile')
@ApiBearerAuth()
@RegisteredUsersOnly()
@Controller('provider/me')
export class MyProviderProfileController {
  constructor(private readonly profile: ProviderProfileService) {}

  @Get()
  @ApiOperation({
    summary:
      'My provider profile with verification state and documents (404 PROVIDER_PROFILE_NOT_FOUND before registering)',
  })
  get(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MyProviderProfileResponse> {
    return this.profile.get(user.userId);
  }

  @Post()
  @ApiOperation({
    summary:
      'Register as a doctor, nutritionist or physio; waits for admin verification',
  })
  @ApiZodBody(registerProviderRequestSchema)
  register(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(registerProviderRequestSchema))
    body: RegisterProviderRequest,
  ): Promise<MyProviderProfileResponse> {
    return this.profile.register(user.userId, body);
  }

  @Patch()
  @ApiOperation({
    summary:
      'Change details, specialties and online fees. A new BMDC number needs verification again',
  })
  @ApiZodBody(updateProviderRequestSchema)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(updateProviderRequestSchema))
    body: UpdateProviderRequest,
  ): Promise<MyProviderProfileResponse> {
    return this.profile.update(user.userId, body);
  }

  @Put('avatar')
  @SingleFileUpload()
  @ApiOperation({
    summary: 'Profile photo (JPEG/PNG/WebP, cropped square, public)',
  })
  setAvatar(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: UploadedMultipartFile | undefined,
  ): Promise<MyProviderProfileResponse> {
    return this.profile.setAvatar(
      user.userId,
      requireUploadedFile(file).buffer,
    );
  }

  @Delete('avatar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove the photo' })
  removeAvatar(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    return this.profile.removeAvatar(user.userId);
  }

  @Post('documents')
  @SingleFileUpload(uploadVerificationDocFieldsSchema)
  @ApiOperation({
    summary: 'BMDC certificate, NID or degree (image or PDF, private)',
  })
  uploadDocument(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: UploadedMultipartFile | undefined,
    @Body(new ZodValidationPipe(uploadVerificationDocFieldsSchema))
    fields: UploadVerificationDocFields,
  ): Promise<MyProviderProfileResponse> {
    return this.profile.uploadDocument(
      user.userId,
      requireUploadedFile(file).buffer,
      fields,
    );
  }

  @Delete('documents/:documentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a document that is not approved yet' })
  removeDocument(
    @CurrentUser() user: AuthenticatedUser,
    @UuidParam('documentId') documentId: string,
  ): Promise<void> {
    return this.profile.removeDocument(user.userId, documentId);
  }

  @Post('resubmit')
  @ApiOperation({ summary: 'After a rejection: send for verification again' })
  resubmit(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MyProviderProfileResponse> {
    return this.profile.resubmit(user.userId);
  }

  @Put('online')
  @ApiOperation({ summary: 'Go online or offline (verified providers only)' })
  @ApiZodBody(setOnlineRequestSchema)
  setOnline(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(setOnlineRequestSchema)) body: SetOnlineRequest,
  ): Promise<MyProviderProfileResponse> {
    return this.profile.setOnline(user.userId, body.isOnline);
  }
}
