import {
  All,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import {
  CurrentUser,
  PublicRoute,
  RegisteredUsersOnly,
} from '../../common/auth/auth-route.decorators.js';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.js';
import { UuidParam } from '../../common/pipes/uuid-param.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { ApiZodBody } from '../../common/swagger/api-zod-body.decorator.js';
import { AppConfigService } from '../../core/config/app-config.service.js';
import type { PaginatedResponse, PaginationQuery } from '../../shared-contracts/common-fields.contract.js';
import {
  listPaymentsQuerySchema,
  startPaymentRequestSchema,
  type PaymentResponse,
  type StartPaymentRequest,
  type StartPaymentResponse,
} from '../../shared-contracts/payments.contract.js';
import {
  ProfileAction,
  type ProfileAccess,
} from '../users/profile-access.service.js';
import {
  CurrentProfileAccess,
  RequireProfileAccess,
} from '../users/require-profile-access.guard.js';
import { PaymentsService } from './payments.service.js';

/** Flattens query string + form body into plain strings. */
function callbackParams(request: Request): Record<string, string> {
  const merged: Record<string, unknown> = {
    ...(request.query as Record<string, unknown>),
    ...((request.body ?? {}) as Record<string, unknown>),
  };
  return Object.fromEntries(
    Object.entries(merged)
      .filter(([, value]) => typeof value === 'string')
      .map(([key, value]) => [key, (value as string).slice(0, 500)]),
  );
}

@ApiTags('payments')
@Controller()
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly config: AppConfigService,
  ) {}

  @Post('payments')
  @ApiBearerAuth()
  @RegisteredUsersOnly()
  @ApiOperation({
    summary:
      'Open the gateway checkout (shurjoPay or SSLCommerz: bKash, Nagad, cards) for an appointment',
  })
  @ApiZodBody(startPaymentRequestSchema)
  start(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(startPaymentRequestSchema)) body: StartPaymentRequest,
    @Req() request: Request,
  ): Promise<StartPaymentResponse> {
    return this.payments.start(user.userId, body, request.ip ?? null);
  }

  @Get('payments/:paymentId')
  @ApiBearerAuth()
  @RegisteredUsersOnly()
  @ApiOperation({ summary: 'One payment of mine (receipt)' })
  get(
    @CurrentUser() user: AuthenticatedUser,
    @UuidParam('paymentId') paymentId: string,
  ): Promise<PaymentResponse> {
    return this.payments.getForPayer(user.userId, paymentId);
  }

  @Post('payments/:paymentId/check')
  @ApiBearerAuth()
  @RegisteredUsersOnly()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Ask the gateway now (after returning from the checkout page)',
  })
  check(
    @CurrentUser() user: AuthenticatedUser,
    @UuidParam('paymentId') paymentId: string,
  ): Promise<PaymentResponse> {
    return this.payments.checkForPayer(user.userId, paymentId);
  }

  @Post('payments/:paymentId/dev-simulate-success')
  @ApiBearerAuth()
  @RegisteredUsersOnly()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Development/staging only: complete a payment without the gateway. 403 in production',
  })
  simulate(
    @CurrentUser() user: AuthenticatedUser,
    @UuidParam('paymentId') paymentId: string,
  ): Promise<PaymentResponse> {
    return this.payments.simulateSuccess(user.userId, paymentId);
  }

  @Get('profiles/:profileId/payments')
  @ApiBearerAuth()
  @RegisteredUsersOnly()
  @RequireProfileAccess(ProfileAction.VIEW)
  @ApiOperation({ summary: 'Paid and refunded payments of a profile, newest first' })
  listForProfile(
    @CurrentProfileAccess() access: ProfileAccess,
    @Query(new ZodValidationPipe(listPaymentsQuerySchema)) query: PaginationQuery,
  ): Promise<PaginatedResponse<PaymentResponse>> {
    return this.payments.listForProfile(access, query);
  }

  /**
   * The gateway sends the payer's browser here (GET or form POST). We verify
   * with the gateway, then hand the payer back to the app's deep link.
   */
  @All('payments/return/:gateway')
  @PublicRoute()
  @ApiExcludeEndpoint()
  async returnFromGateway(
    @Param('gateway') gateway: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const payment = await this.payments
      .handleCallback(gateway, callbackParams(request), 'RETURN')
      .catch(() => null);
    const target = new URL(this.config.payments.appReturnUrl);
    if (payment) {
      target.searchParams.set('paymentId', payment.id);
      target.searchParams.set('status', payment.status);
    } else {
      target.searchParams.set('status', 'UNKNOWN');
    }
    response.redirect(HttpStatus.FOUND, target.toString());
  }

  /** Server-to-server notification. Always 200 so the gateway does not retry forever. */
  @Post('payments/ipn/:gateway')
  @PublicRoute()
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  async ipn(
    @Param('gateway') gateway: string,
    @Req() request: Request,
  ): Promise<{ received: boolean }> {
    const payment = await this.payments
      .handleCallback(gateway, callbackParams(request), 'IPN')
      .catch(() => null);
    return { received: Boolean(payment) };
  }
}
