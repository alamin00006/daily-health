import { Body, Controller, Get, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, PublicRoute } from '../../common/auth/auth-route.decorators.js';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.js';
import { AdminOnly } from '../../common/auth/staff-role.guard.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { ApiZodBody } from '../../common/swagger/api-zod-body.decorator.js';
import {
  updateAppConfigRequestSchema,
  type AdminAppConfigResponse,
  type AppConfigChangeResponse,
  type AppConfigResponse,
  type UpdateAppConfigRequest,
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
