import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
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
  listProviderConsultationsQuerySchema,
  listQuickConsultSettingHistoryQuerySchema,
  quickConsultKindSchema,
  startBookedConsultRequestSchema,
  updateQuickConsultSettingRequestSchema,
  type ConsultationResponse,
  type ListProviderConsultationsQuery,
  type ListQuickConsultSettingHistoryQuery,
  type QuickConsultKind,
  type QuickConsultQueueItemResponse,
  type QuickConsultSettingChangeResponse,
  type QuickConsultSettingResponse,
  type StartBookedConsultRequest,
  type UpdateQuickConsultSettingRequest,
} from '../../shared-contracts/consultation.contract.js';
import { ConsultationsService } from './consultations.service.js';
import { QuickConsultSettingsService } from './quick-consult-settings.service.js';
import { QuickConsultsService } from './quick-consults.service.js';

@ApiTags('consultations: provider panel')
@ApiBearerAuth()
@RegisteredUsersOnly()
@Controller('provider/me')
export class ProviderConsultationsController {
  constructor(
    private readonly consultations: ConsultationsService,
    private readonly quickConsults: QuickConsultsService,
  ) {}

  @Get('consultations')
  @ApiOperation({ summary: 'My consultations (default: ongoing), newest first' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(listProviderConsultationsQuerySchema))
    query: ListProviderConsultationsQuery,
  ): Promise<PaginatedResponse<ConsultationResponse>> {
    return this.consultations.listForProvider(user.userId, query);
  }

  @Post('consultations')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Open the consultation of a confirmed VIDEO/CHAT booking (15 min before until 1 h after); idempotent',
  })
  @ApiZodBody(startBookedConsultRequestSchema)
  startBooked(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(startBookedConsultRequestSchema)) body: StartBookedConsultRequest,
  ): Promise<ConsultationResponse> {
    return this.consultations.startBooked(user.userId, body.appointmentId);
  }

  @Post('consultations/:consultationId/ring')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ring the patient again while the call is open' })
  ring(
    @CurrentUser() user: AuthenticatedUser,
    @UuidParam('consultationId') consultationId: string,
  ): Promise<ConsultationResponse> {
    return this.consultations.ringAgain(user.userId, consultationId);
  }

  @Get('quick-consults/queue')
  @ApiOperation({ summary: 'Waiting quick consults I may take (no health details before accepting)' })
  queue(@CurrentUser() user: AuthenticatedUser): Promise<QuickConsultQueueItemResponse[]> {
    return this.quickConsults.queue(user.userId);
  }

  @Post('quick-consults/:consultationId/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Take a waiting quick consult (first doctor wins; 409 if taken)' })
  accept(
    @CurrentUser() user: AuthenticatedUser,
    @UuidParam('consultationId') consultationId: string,
  ): Promise<ConsultationResponse> {
    return this.quickConsults.accept(user.userId, consultationId);
  }
}

@ApiTags('consultations: admin')
@ApiBearerAuth()
@RegisteredUsersOnly()
@AdminOnly()
@Controller('admin/quick-consult-settings')
export class AdminQuickConsultSettingsController {
  constructor(private readonly settings: QuickConsultSettingsService) {}

  @Get()
  @ApiOperation({ summary: 'Price and rules of each quick consult kind' })
  list(): Promise<QuickConsultSettingResponse[]> {
    return this.settings.list();
  }

  @Get('history')
  @ApiOperation({ summary: 'Who changed what, newest first' })
  history(
    @Query(new ZodValidationPipe(listQuickConsultSettingHistoryQuerySchema))
    query: ListQuickConsultSettingHistoryQuery,
  ): Promise<PaginatedResponse<QuickConsultSettingChangeResponse>> {
    return this.settings.history(query);
  }

  @Put(':kind')
  @ApiOperation({
    summary: 'Change the price/rules; applies to quick consults started afterwards',
  })
  @ApiZodBody(updateQuickConsultSettingRequestSchema)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @KindParam() kind: QuickConsultKind,
    @Body(new ZodValidationPipe(updateQuickConsultSettingRequestSchema))
    body: UpdateQuickConsultSettingRequest,
  ): Promise<QuickConsultSettingResponse> {
    return this.settings.update(user.userId, kind, body);
  }
}

/** `:kind` path param validated as GENERAL | WOMENS_HEALTH. */
function KindParam(): ParameterDecorator {
  return Param('kind', new ZodValidationPipe(quickConsultKindSchema));
}
