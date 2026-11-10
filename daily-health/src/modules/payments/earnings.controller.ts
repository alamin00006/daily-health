import { Body, Controller, Get, Post, Put, Query } from '@nestjs/common';
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
import type { PaginatedResponse, PaginationQuery } from '../../shared-contracts/common-fields.contract.js';
import {
  createPayoutRequestSchema,
  listEarningsQuerySchema,
  listPayoutsQuerySchema,
  listRefundsQuerySchema,
  markPayoutPaidRequestSchema,
  markRefundProcessedRequestSchema,
  payoutAccountRequestSchema,
  payoutsDueQuerySchema,
  type AdminRefundResponse,
  type CreatePayoutRequest,
  type EarningResponse,
  type EarningsSummaryResponse,
  type ListPayoutsQuery,
  type ListRefundsQuery,
  type MarkPayoutPaidRequest,
  type MarkRefundProcessedRequest,
  type PayoutAccountRequest,
  type PayoutAccountResponse,
  type PayoutDueResponse,
  type PayoutResponse,
  type PayoutsDueQuery,
} from '../../shared-contracts/payments.contract.js';
import { EarningsService } from './earnings.service.js';
import { RefundsService } from './refunds.service.js';

@ApiTags('payments: provider earnings')
@ApiBearerAuth()
@RegisteredUsersOnly()
@Controller('provider/me')
export class MyEarningsController {
  constructor(private readonly earnings: EarningsService) {}

  @Get('earnings/summary')
  @ApiOperation({ summary: 'Unsettled, pending and paid-out totals' })
  summary(@CurrentUser() user: AuthenticatedUser): Promise<EarningsSummaryResponse> {
    return this.earnings.summary(user.userId);
  }

  @Get('earnings')
  @ApiOperation({ summary: 'Earnings and refund adjustments, newest first' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(listEarningsQuerySchema)) query: PaginationQuery,
  ): Promise<PaginatedResponse<EarningResponse>> {
    return this.earnings.list(user.userId, query);
  }

  @Get('payouts')
  @ApiOperation({ summary: 'My payouts' })
  payouts(@CurrentUser() user: AuthenticatedUser): Promise<PayoutResponse[]> {
    return this.earnings.myPayouts(user.userId);
  }

  @Get('payout-account')
  @ApiOperation({ summary: 'Where I am paid (number masked); null if not set' })
  getAccount(@CurrentUser() user: AuthenticatedUser): Promise<PayoutAccountResponse | null> {
    return this.earnings.getAccount(user.userId);
  }

  @Put('payout-account')
  @ApiOperation({ summary: 'Set bKash, Nagad or bank account for payouts' })
  @ApiZodBody(payoutAccountRequestSchema)
  setAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(payoutAccountRequestSchema)) body: PayoutAccountRequest,
  ): Promise<PayoutAccountResponse> {
    return this.earnings.setAccount(user.userId, body);
  }
}

@ApiTags('admin: refunds & payouts')
@ApiBearerAuth()
@RegisteredUsersOnly()
@AdminOnly()
@Controller('admin')
export class AdminPaymentsController {
  constructor(
    private readonly earnings: EarningsService,
    private readonly refunds: RefundsService,
  ) {}

  @Get('refunds')
  @ApiOperation({ summary: 'Refunds by status (default REQUESTED: waiting)' })
  listRefunds(
    @Query(new ZodValidationPipe(listRefundsQuerySchema)) query: ListRefundsQuery,
  ): Promise<PaginatedResponse<AdminRefundResponse>> {
    return this.refunds.list(query);
  }

  @Post('refunds/:refundId/mark-processed')
  @ApiOperation({ summary: "Refunded in the gateway's merchant panel" })
  @ApiZodBody(markRefundProcessedRequestSchema)
  markRefundProcessed(
    @CurrentUser() user: AuthenticatedUser,
    @UuidParam('refundId') refundId: string,
    @Body(new ZodValidationPipe(markRefundProcessedRequestSchema)) body: MarkRefundProcessedRequest,
  ): Promise<AdminRefundResponse> {
    return this.refunds.markProcessed(user.userId, refundId, body.gatewayRefundId);
  }

  @Post('refunds/:refundId/retry')
  @ApiOperation({ summary: 'Send a failed refund to the gateway again' })
  retryRefund(@UuidParam('refundId') refundId: string): Promise<AdminRefundResponse> {
    return this.refunds.retry(refundId);
  }

  @Get('payouts/due')
  @ApiOperation({ summary: 'Providers with unsettled earnings up to a day' })
  due(
    @Query(new ZodValidationPipe(payoutsDueQuerySchema)) query: PayoutsDueQuery,
  ): Promise<PayoutDueResponse[]> {
    return this.earnings.due(query.until);
  }

  @Post('payouts')
  @ApiOperation({ summary: "Create a payout from a provider's unsettled earnings" })
  @ApiZodBody(createPayoutRequestSchema)
  createPayout(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createPayoutRequestSchema)) body: CreatePayoutRequest,
  ): Promise<PayoutResponse> {
    return this.earnings.createPayout(user.userId, body.providerId, body.until);
  }

  @Get('payouts')
  @ApiOperation({ summary: 'Payouts, newest first' })
  listPayouts(
    @Query(new ZodValidationPipe(listPayoutsQuerySchema)) query: ListPayoutsQuery,
  ): Promise<PaginatedResponse<PayoutResponse>> {
    return this.earnings.listPayouts(query);
  }

  @Get('payouts/:payoutId/account')
  @ApiOperation({ summary: 'The full account number, to make the transfer' })
  account(@UuidParam('payoutId') payoutId: string) {
    return this.earnings.accountForPayout(payoutId);
  }

  @Post('payouts/:payoutId/mark-paid')
  @ApiOperation({ summary: 'Transfer done: record the TrxID / reference' })
  @ApiZodBody(markPayoutPaidRequestSchema)
  markPaid(
    @CurrentUser() user: AuthenticatedUser,
    @UuidParam('payoutId') payoutId: string,
    @Body(new ZodValidationPipe(markPayoutPaidRequestSchema)) body: MarkPayoutPaidRequest,
  ): Promise<PayoutResponse> {
    return this.earnings.markPaid(user.userId, payoutId, body.reference);
  }

  @Post('payouts/:payoutId/cancel')
  @ApiOperation({ summary: 'Cancel a pending payout; its earnings become unsettled again' })
  cancel(@UuidParam('payoutId') payoutId: string): Promise<PayoutResponse> {
    return this.earnings.cancelPayout(payoutId);
  }
}
