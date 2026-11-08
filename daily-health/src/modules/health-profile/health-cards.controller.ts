import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import {
  CurrentUser,
  IdentifyCallerIfLoggedIn,
  OptionalCurrentUser,
  PublicRoute,
  RegisteredUsersOnly,
} from '../../common/auth/auth-route.decorators.js';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.js';
import { PublicLookupRateLimit } from '../../common/decorators/public-lookup-rate-limit.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { ApiZodBody } from '../../common/swagger/api-zod-body.decorator.js';
import {
  paginationQuerySchema,
  type PaginatedResponse,
  type PaginationQuery,
} from '../../shared-contracts/common-fields.contract.js';
import {
  issueHealthCardRequestSchema,
  type HealthCardAccessResponse,
  type HealthCardResponse,
  type HealthCardScanResponse,
  type HealthCardStatusResponse,
  type IssueHealthCardRequest,
} from '../../shared-contracts/health.contract.js';
import {
  ProfileAction,
  type ProfileAccess,
} from '../users/profile-access.service.js';
import {
  CurrentProfileAccess,
  RequireProfileAccess,
} from '../users/require-profile-access.guard.js';
import { HealthCardsService } from './health-cards.service.js';

@ApiTags('health: QR health card')
@ApiBearerAuth()
@RegisteredUsersOnly()
@Controller('profiles/:profileId/health-card')
export class HealthCardsController {
  constructor(private readonly cards: HealthCardsService) {}

  @Get()
  @RequireProfileAccess(ProfileAction.VIEW)
  @ApiOperation({ summary: 'The card and its QR url, or null if not issued' })
  status(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentProfileAccess() access: ProfileAccess,
  ): Promise<HealthCardStatusResponse> {
    return this.cards.status(user.userId, access);
  }

  @Post()
  @RequireProfileAccess(ProfileAction.EDIT)
  @ApiOperation({
    summary:
      'Issue the card, or replace it with a new QR code (the old one stops working) (OWNER, CAREGIVER)',
  })
  @ApiZodBody(issueHealthCardRequestSchema)
  issue(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentProfileAccess() access: ProfileAccess,
    @Body(new ZodValidationPipe(issueHealthCardRequestSchema))
    body: IssueHealthCardRequest,
  ): Promise<HealthCardResponse> {
    return this.cards.issue(user.userId, access, body);
  }

  @Delete()
  @RequireProfileAccess(ProfileAction.EDIT)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Turn the card off; scans fail until reissued (OWNER, CAREGIVER)',
  })
  revoke(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentProfileAccess() access: ProfileAccess,
  ): Promise<void> {
    return this.cards.revoke(user.userId, access);
  }

  @Get('accesses')
  @RequireProfileAccess(ProfileAction.VIEW)
  @ApiOperation({ summary: 'When the card was scanned, newest first' })
  accesses(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentProfileAccess() access: ProfileAccess,
    @Query(new ZodValidationPipe(paginationQuerySchema)) query: PaginationQuery,
  ): Promise<PaginatedResponse<HealthCardAccessResponse>> {
    return this.cards.accesses(user.userId, access, query);
  }
}

/** What the QR code opens. No login needed: it is meant for emergencies. */
@ApiTags('health: QR health card')
@Controller('health-cards')
export class HealthCardScanController {
  constructor(private readonly cards: HealthCardsService) {}

  @Get(':qrToken')
  @PublicRoute()
  @IdentifyCallerIfLoggedIn()
  @PublicLookupRateLimit()
  @ApiOperation({
    summary:
      'Public: emergency summary behind a QR code (name, age, blood group, conditions, allergies). Every scan is logged.',
  })
  scan(
    @Param('qrToken') qrToken: string,
    @OptionalCurrentUser() viewer: AuthenticatedUser | null,
    @Req() request: Request,
  ): Promise<HealthCardScanResponse> {
    return this.cards.scan(qrToken, {
      viewerUserId: viewer?.userId ?? null,
      ip: request.ip ?? null,
    });
  }
}
