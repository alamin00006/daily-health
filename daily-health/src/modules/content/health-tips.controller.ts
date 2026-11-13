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
  Query,
  UploadedFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, PublicRoute } from '../../common/auth/auth-route.decorators.js';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.js';
import { StaffOnly } from '../../common/auth/staff-role.guard.js';
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
  createHealthTipRequestSchema,
  listHealthTipsQuerySchema,
  listStaffHealthTipsQuerySchema,
  updateHealthTipRequestSchema,
  type CreateHealthTipRequest,
  type HealthTipResponse,
  type ListHealthTipsQuery,
  type ListStaffHealthTipsQuery,
  type StaffHealthTipResponse,
  type UpdateHealthTipRequest,
} from '../../shared-contracts/content.contract.js';
import { HealthTipsService } from './health-tips.service.js';

@ApiTags('content: health tips')
@PublicRoute()
@Controller('health-tips')
export class HealthTipsController {
  constructor(private readonly tips: HealthTipsService) {}

  @Get()
  @ApiOperation({ summary: 'Published tips, newest first (guests too)' })
  list(
    @Query(new ZodValidationPipe(listHealthTipsQuerySchema)) query: ListHealthTipsQuery,
  ): Promise<PaginatedResponse<HealthTipResponse>> {
    return this.tips.listPublished(query);
  }

  @Get(':tipId')
  @ApiOperation({ summary: 'One published tip' })
  get(@UuidParam('tipId') tipId: string): Promise<HealthTipResponse> {
    return this.tips.getPublished(tipId);
  }
}

@ApiTags('staff: health tips')
@ApiBearerAuth()
@StaffOnly()
@Controller('staff/health-tips')
export class StaffHealthTipsController {
  constructor(private readonly tips: HealthTipsService) {}

  @Get()
  @ApiOperation({ summary: 'All tips, drafts too, last edited first' })
  list(
    @Query(new ZodValidationPipe(listStaffHealthTipsQuerySchema)) query: ListStaffHealthTipsQuery,
  ): Promise<PaginatedResponse<StaffHealthTipResponse>> {
    return this.tips.staffList(query);
  }

  @Get(':tipId')
  get(@UuidParam('tipId') tipId: string): Promise<StaffHealthTipResponse> {
    return this.tips.staffGet(tipId);
  }

  @Post()
  @ApiOperation({ summary: 'New tip (a draft)' })
  @ApiZodBody(createHealthTipRequestSchema)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createHealthTipRequestSchema)) body: CreateHealthTipRequest,
  ): Promise<StaffHealthTipResponse> {
    return this.tips.create(user.userId, body);
  }

  @Patch(':tipId')
  @ApiZodBody(updateHealthTipRequestSchema)
  update(
    @UuidParam('tipId') tipId: string,
    @Body(new ZodValidationPipe(updateHealthTipRequestSchema)) body: UpdateHealthTipRequest,
  ): Promise<StaffHealthTipResponse> {
    return this.tips.update(tipId, body);
  }

  @Post(':tipId/publish')
  @ApiOperation({ summary: 'Show it in the app' })
  publish(@UuidParam('tipId') tipId: string): Promise<StaffHealthTipResponse> {
    return this.tips.setPublished(tipId, true);
  }

  @Post(':tipId/unpublish')
  @ApiOperation({ summary: 'Back to draft (hidden from the app)' })
  unpublish(@UuidParam('tipId') tipId: string): Promise<StaffHealthTipResponse> {
    return this.tips.setPublished(tipId, false);
  }

  @Put(':tipId/image')
  @SingleFileUpload()
  @ApiOperation({ summary: 'Picture (JPEG/PNG/WebP, public)' })
  setImage(
    @UuidParam('tipId') tipId: string,
    @UploadedFile() file: UploadedMultipartFile | undefined,
  ): Promise<StaffHealthTipResponse> {
    return this.tips.setImage(tipId, requireUploadedFile(file).buffer);
  }

  @Delete(':tipId/image')
  removeImage(@UuidParam('tipId') tipId: string): Promise<StaffHealthTipResponse> {
    return this.tips.removeImage(tipId);
  }

  @Delete(':tipId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@UuidParam('tipId') tipId: string): Promise<void> {
    return this.tips.remove(tipId);
  }
}
