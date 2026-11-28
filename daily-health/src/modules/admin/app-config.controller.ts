import { Body, Controller, Get, Param, Patch, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, PublicRoute } from '../../common/auth/auth-route.decorators.js';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.js';
import { AdminOnly } from '../../common/auth/staff-role.guard.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { ApiZodBody } from '../../common/swagger/api-zod-body.decorator.js';
import {
  legalPageSlugSchema,
  updateAppConfigRequestSchema,
  updateLegalPageRequestSchema,
  updateSupportContactsRequestSchema,
  type AdminAppConfigResponse,
  type AppConfigChangeResponse,
  type AppConfigResponse,
  type LegalPageResponse,
  type LegalPageSlug,
  type UpdateAppConfigRequest,
  type UpdateLegalPageRequest,
  type UpdateSupportContactsRequest,
} from '../../shared-contracts/app-config.contract.js';
import {
  paginationQuerySchema,
  type PaginatedResponse,
  type PaginationQuery,
} from '../../shared-contracts/common-fields.contract.js';
import { AppConfigService } from './app-config.service.js';

@ApiTags('app config')
@PublicRoute()
@Controller('app-config')
export class AppConfigController {
  constructor(private readonly config: AppConfigService) {}

  @Get()
  @ApiOperation({ summary: "The app's primary colour and its shades (guests too)" })
  get(): Promise<AppConfigResponse> {
    return this.config.get();
  }
}

@ApiTags('admin: app config')
@ApiBearerAuth()
@AdminOnly()
@Controller('admin/app-config')
export class AdminAppConfigController {
  constructor(private readonly config: AppConfigService) {}

  @Get()
  get(): Promise<AdminAppConfigResponse> {
    return this.config.adminGet();
  }

  @Patch()
  @ApiOperation({ summary: 'Change the app primary colour (white text on it must stay readable)' })
  @ApiZodBody(updateAppConfigRequestSchema)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(updateAppConfigRequestSchema)) body: UpdateAppConfigRequest,
  ): Promise<AdminAppConfigResponse> {
    return this.config.update(user.userId, body);
  }

  @Get('history')
  history(
    @Query(new ZodValidationPipe(paginationQuerySchema)) query: PaginationQuery,
  ): Promise<PaginatedResponse<AppConfigChangeResponse>> {
    return this.config.history(query);
  }
}

@ApiTags('app config')
@PublicRoute()
@Controller('legal')
export class LegalPagesController {
  constructor(private readonly config: AppConfigService) {}

  @Get(':slug')
  @ApiOperation({ summary: 'Terms (TERMS) or privacy policy (PRIVACY); guests too' })
  get(@Param('slug', new ZodValidationPipe(legalPageSlugSchema)) slug: LegalPageSlug): Promise<LegalPageResponse> {
    return this.config.legalPage(slug);
  }
}

@ApiTags('admin: app config')
@ApiBearerAuth()
@AdminOnly()
@Controller('admin')
export class AdminSupportAndLegalController {
  constructor(private readonly config: AppConfigService) {}

  @Patch('app-config/support')
  @ApiOperation({ summary: 'WhatsApp and hotline numbers on the account page (null hides one)' })
  @ApiZodBody(updateSupportContactsRequestSchema)
  support(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(updateSupportContactsRequestSchema)) body: UpdateSupportContactsRequest,
  ): Promise<AdminAppConfigResponse> {
    return this.config.updateSupport(user.userId, body);
  }

  @Put('legal/:slug')
  @ApiOperation({ summary: 'Write the terms or privacy policy shown in the app' })
  @ApiZodBody(updateLegalPageRequestSchema)
  legal(
    @CurrentUser() user: AuthenticatedUser,
    @Param('slug', new ZodValidationPipe(legalPageSlugSchema)) slug: LegalPageSlug,
    @Body(new ZodValidationPipe(updateLegalPageRequestSchema)) body: UpdateLegalPageRequest,
  ): Promise<LegalPageResponse> {
    return this.config.updateLegalPage(user.userId, slug, body);
  }
}
