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
import type {
  PaginatedResponse,
  PaginationQuery,
} from '../../shared-contracts/common-fields.contract.js';
import {
  createHospitalRequestSchema,
  listReviewsQuerySchema,
  listSpecialtiesQuerySchema,
  searchHospitalsQuerySchema,
  searchProvidersQuerySchema,
  type CreateHospitalRequest,
  type HospitalResponse,
  type ListSpecialtiesQuery,
  type ProviderDetailResponse,
  type ProviderSummaryResponse,
  type ReviewResponse,
  type SearchHospitalsQuery,
  type SearchProvidersQuery,
  type SpecialtyResponse,
} from '../../shared-contracts/doctors.contract.js';
import { ProviderDirectoryService } from './provider-directory.service.js';
import { ProviderReviewsService } from './provider-reviews.service.js';
import { ProviderSchedulesService } from './provider-schedules.service.js';

/** Finding providers. Public: guests browse doctors too (CLAUDE.md §1). */
@ApiTags('doctors: directory')
@Controller()
export class ProviderDirectoryController {
  constructor(
    private readonly directory: ProviderDirectoryService,
    private readonly reviews: ProviderReviewsService,
    private readonly schedules: ProviderSchedulesService,
  ) {}

  @Get('specialties')
  @PublicRoute()
  @ApiOperation({ summary: 'Specialties with the number of verified providers' })
  listSpecialties(
    @Query(new ZodValidationPipe(listSpecialtiesQuerySchema))
    query: ListSpecialtiesQuery,
  ): Promise<SpecialtyResponse[]> {
    return this.directory.listSpecialties(query);
  }

  @Get('providers')
  @PublicRoute()
  @ApiOperation({
    summary:
      'Search verified providers: name (fuzzy, Bangla or English), BMDC number, specialty, gender, mode, online now, district',
  })
  search(
    @Query(new ZodValidationPipe(searchProvidersQuerySchema))
    query: SearchProvidersQuery,
  ): Promise<PaginatedResponse<ProviderSummaryResponse>> {
    return this.directory.search(query);
  }

  @Get('providers/:providerId')
  @PublicRoute()
  @ApiOperation({
    summary: 'A provider page: chambers, weekly sessions, fees, latest reviews',
  })
  detail(
    @UuidParam('providerId') providerId: string,
  ): Promise<ProviderDetailResponse> {
    return this.directory.detail(providerId);
  }

  @Get('providers/:providerId/reviews')
  @PublicRoute()
  @ApiOperation({ summary: 'Reviews, newest first' })
  listReviews(
    @UuidParam('providerId') providerId: string,
    @Query(new ZodValidationPipe(listReviewsQuerySchema))
    query: PaginationQuery,
  ): Promise<PaginatedResponse<ReviewResponse>> {
    return this.reviews.list(providerId, query.cursor, query.limit);
  }

  @Get('hospitals')
  @ApiBearerAuth()
  @RegisteredUsersOnly()
  @ApiOperation({ summary: 'Find a hospital by name (for adding a chamber)' })
  searchHospitals(
    @Query(new ZodValidationPipe(searchHospitalsQuerySchema))
    query: SearchHospitalsQuery,
  ): Promise<HospitalResponse[]> {
    return this.schedules.searchHospitals(query.q);
  }

  @Post('hospitals')
  @ApiBearerAuth()
  @RegisteredUsersOnly()
  @ApiOperation({
    summary:
      'Add a hospital that is not listed (providers only); the same name and district returns the existing one',
  })
  @ApiZodBody(createHospitalRequestSchema)
  createHospital(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createHospitalRequestSchema))
    body: CreateHospitalRequest,
  ): Promise<HospitalResponse> {
    return this.schedules.createHospital(user.userId, body);
  }
}
