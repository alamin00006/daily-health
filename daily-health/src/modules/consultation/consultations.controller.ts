import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
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
import type { PaginatedResponse } from '../../shared-contracts/common-fields.contract.js';
import {
  listMyConsultationsQuerySchema,
  startQuickConsultRequestSchema,
  type CallJoinResponse,
  type ConsultationResponse,
  type ListMyConsultationsQuery,
  type QuickConsultOptionResponse,
  type StartQuickConsultRequest,
} from '../../shared-contracts/consultation.contract.js';
import { ConsultationsService } from './consultations.service.js';
import { QuickConsultSettingsService } from './quick-consult-settings.service.js';
import { QuickConsultsService } from './quick-consults.service.js';

@ApiTags('consultations')
@ApiBearerAuth()
@RegisteredUsersOnly()
@Controller()
export class ConsultationsController {
  constructor(
    private readonly consultations: ConsultationsService,
    private readonly quickConsults: QuickConsultsService,
    private readonly settings: QuickConsultSettingsService,
  ) {}

  @Get('quick-consults/options')
  @ApiOperation({ summary: 'Quick consult kinds with the current price, wait time and doctors online' })
  options(): Promise<QuickConsultOptionResponse[]> {
    return this.settings.options();
  }

  @Post('profiles/:profileId/quick-consults')
  @ApiOperation({
    summary:
      'Start a quick chat consult (then pay with purpose QUICK_CONSULT within 15 min). Women’s health: the patient themself only',
  })
  @ApiZodBody(startQuickConsultRequestSchema)
  startQuick(
    @CurrentUser() user: AuthenticatedUser,
    @UuidParam('profileId') profileId: string,
    @Body(new ZodValidationPipe(startQuickConsultRequestSchema)) body: StartQuickConsultRequest,
  ): Promise<ConsultationResponse> {
    return this.quickConsults.start(user.userId, profileId, body);
  }

  @Get('me/consultations')
  @ApiOperation({ summary: 'Consultations I take part in (patient side), newest first' })
  listMine(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(listMyConsultationsQuerySchema)) query: ListMyConsultationsQuery,
  ): Promise<PaginatedResponse<ConsultationResponse>> {
    return this.consultations.listMine(user.userId, query);
  }

  @Get('consultations/:consultationId')
  @ApiOperation({ summary: 'One consultation (participants only)' })
  get(
    @CurrentUser() user: AuthenticatedUser,
    @UuidParam('consultationId') consultationId: string,
  ): Promise<ConsultationResponse> {
    return this.consultations.getForUser(user.userId, consultationId);
  }

  @Post('consultations/:consultationId/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a quick consult before a doctor takes it (paid: full refund)' })
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @UuidParam('consultationId') consultationId: string,
  ): Promise<ConsultationResponse> {
    return this.quickConsults.cancel(user.userId, consultationId);
  }

  @Post('consultations/:consultationId/end')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'End it: the doctor any consult, the patient side a quick one' })
  end(
    @CurrentUser() user: AuthenticatedUser,
    @UuidParam('consultationId') consultationId: string,
  ): Promise<ConsultationResponse> {
    return this.consultations.endByUser(user.userId, consultationId);
  }

  @Post('consultations/:consultationId/call/join')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Agora token to join the video call. The doctor’s join opens the call and rings the patient',
  })
  joinCall(
    @CurrentUser() user: AuthenticatedUser,
    @UuidParam('consultationId') consultationId: string,
  ): Promise<CallJoinResponse> {
    return this.consultations.joinCall(user.userId, consultationId);
  }

  @Post('consultations/:consultationId/call/decline')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Patient declines the ringing call (the doctor is told)' })
  async declineCall(
    @CurrentUser() user: AuthenticatedUser,
    @UuidParam('consultationId') consultationId: string,
  ): Promise<void> {
    await this.consultations.declineCall(user.userId, consultationId);
  }

  @Post('consultations/:consultationId/call/leave')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Leave the call (the doctor leaving closes it; the chat stays open)' })
  leaveCall(
    @CurrentUser() user: AuthenticatedUser,
    @UuidParam('consultationId') consultationId: string,
  ): Promise<ConsultationResponse> {
    return this.consultations.leaveCall(user.userId, consultationId);
  }
}
