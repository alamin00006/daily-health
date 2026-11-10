import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  RegisteredUsersOnly,
} from '../../common/auth/auth-route.decorators.js';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.js';
import { AdminOnly } from '../../common/auth/staff-role.guard.js';
import { UuidParam } from '../../common/pipes/uuid-param.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { ApiZodBody } from '../../common/swagger/api-zod-body.decorator.js';
import type { PaginatedResponse } from '../../shared-contracts/common-fields.contract.js';
import {
  listProvidersForReviewQuerySchema,
  rejectProviderRequestSchema,
  type ListProvidersForReviewQuery,
  type ProviderForReviewResponse,
  type RejectProviderRequest,
} from '../../shared-contracts/doctors.contract.js';
import { ProviderVerificationService } from './provider-verification.service.js';

@ApiTags('admin: provider verification')
@ApiBearerAuth()
@RegisteredUsersOnly()
@AdminOnly()
@Controller('admin/providers')
export class ProviderVerificationController {
  constructor(private readonly verification: ProviderVerificationService) {}

  @Get()
  @ApiOperation({
    summary: 'Providers by verification status (default PENDING)',
  })
  list(
    @Query(new ZodValidationPipe(listProvidersForReviewQuerySchema))
    query: ListProvidersForReviewQuery,
  ): Promise<PaginatedResponse<ProviderForReviewResponse>> {
    return this.verification.list(query);
  }

  @Get(':providerId')
  @ApiOperation({ summary: 'One provider with documents' })
  get(
    @UuidParam('providerId') providerId: string,
  ): Promise<ProviderForReviewResponse> {
    return this.verification.get(providerId);
  }

  @Post(':providerId/verify')
  @ApiOperation({
    summary: 'BMDC number and documents checked: show to patients',
  })
  verify(
    @CurrentUser() user: AuthenticatedUser,
    @UuidParam('providerId') providerId: string,
  ): Promise<ProviderForReviewResponse> {
    return this.verification.verify(user.userId, providerId);
  }

  @Post(':providerId/reject')
  @ApiOperation({
    summary: 'Reject (or suspend) with a reason the provider sees',
  })
  @ApiZodBody(rejectProviderRequestSchema)
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @UuidParam('providerId') providerId: string,
    @Body(new ZodValidationPipe(rejectProviderRequestSchema))
    body: RejectProviderRequest,
  ): Promise<ProviderForReviewResponse> {
    return this.verification.reject(user.userId, providerId, body.reason);
  }
}
