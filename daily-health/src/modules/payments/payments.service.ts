import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import {
  PAYMENT_PROVIDER_ASSIGNED_EVENT,
  PAYMENT_SUCCEEDED_EVENT,
  type PaymentProviderAssignedEvent,
  type PaymentSucceededEvent,
} from '../../common/events/booking-events.js';
import { AppException } from '../../common/errors/app-exception.js';
import { toBanglaDigits } from '../../common/formatting/bangla-digits.js';
import {
  afterCursor,
  toKeysetPage,
} from '../../common/pagination/keyset-cursor.js';
import { AppConfigService } from '../../core/config/app-config.service.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { ReadableIdService } from '../../core/readable-ids/readable-id.service.js';
import {
  Prisma,
  type GatewayTransactionKind,
  type Payment,
} from '../../generated/prisma/client.js';
import type { PaginatedResponse, PaginationQuery } from '../../shared-contracts/common-fields.contract.js';
import type {
  PaymentResponse,
  StartPaymentRequest,
  StartPaymentResponse,
} from '../../shared-contracts/payments.contract.js';
import { UserAccountsService } from '../auth/user-accounts.service.js';
import { NotificationDeliveryService } from '../notifications/notification-delivery.service.js';
import type { ProfileAccess } from '../users/profile-access.service.js';
import {
  GatewayUnavailableError,
  type GatewayExchange,
  type PaymentGateway,
  type VerifyResult,
} from './gateways/payment-gateway.js';
import { CouponsService } from './coupons.service.js';
import { PayableRegistryService } from './payable-registry.service.js';
import { PaymentGatewaysService } from './payment-gateways.service.js';
import { PAYMENT_INCLUDE, toPaymentResponse } from './payment-responses.js';
import { PaymentsErrorCode } from './payments-error-codes.js';

export interface PaymentSummary {
  paymentId: string;
  invoiceNo: string;
  method: Payment['method'];
  paidAt: string | null;
  refund: { amount: number; status: 'REQUESTED' | 'PROCESSED' | 'FAILED' } | null;
}

/** Gateway forms require a phone; accounts have none until SMS login launches. */
const PLACEHOLDER_PHONE = '01700000000';
/** An unfinished checkout older than this is closed as abandoned. */
const ABANDONED_AFTER_MS = 45 * 60_000;
/** Amounts are equal within a paisa. */
const AMOUNT_TOLERANCE = 0.01;

type Tx = Prisma.TransactionClient;

/**
 * Payments through the configured aggregator (CLAUDE.md §4 "Payment link"):
 * start a checkout, then finalize from the return page, the IPN, the app's
 * "check" call or the reconciliation job, whichever comes first. Finalizing
 * always asks the gateway (callbacks only say which payment to check) and is
 * safe to run twice.
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly gateways: PaymentGatewaysService,
    private readonly payables: PayableRegistryService,
    private readonly readableIds: ReadableIdService,
    private readonly accounts: UserAccountsService,
    private readonly delivery: NotificationDeliveryService,
    private readonly events: EventEmitter2,
    private readonly coupons: CouponsService,
  ) {}

  async start(
    userId: string,
    input: StartPaymentRequest,
    clientIp: string | null,
  ): Promise<StartPaymentResponse> {
    const item = await this.payables.resolve(input.purpose, userId, input.referenceId);
    const returnUrl = this.config.payments.appReturnUrl;
    // The platform pays a coupon's discount; the gateway charges the rest.
    const discount = input.couponClaimId
      ? await this.coupons.quoteForCheckout(userId, input.couponClaimId, input.purpose, item.amount)
      : 0;
    const payAmount = Math.round((item.amount - discount) * 100) / 100;
    const claimId = input.couponClaimId ?? null;

    const live = await this.prisma.payment.findFirst({
      where: {
        purpose: input.purpose,
        referenceId: input.referenceId,
        status: { in: ['INITIATED', 'SUCCESS'] },
      },
      include: PAYMENT_INCLUDE,
    });
    if (live?.status === 'SUCCESS') throw alreadyPaid();
    if (live) {
      // Paid meanwhile in another tab? Then it is done.
      const checked = await this.finalize(live, 'VERIFY');
      if (checked.status === 'SUCCESS') throw alreadyPaid();
      if (
        checked.status === 'INITIATED' &&
        checked.payerUserId === userId &&
        checked.checkoutUrl &&
        checked.gateway === this.gateways.active().name &&
        Number(checked.amount) === payAmount &&
        Number(checked.listAmount) === item.amount &&
        (live.redemption?.claimId ?? null) === claimId &&
        (checked.checkoutExpiresAt?.getTime() ?? 0) > Date.now() + 60_000
      ) {
        return {
          payment: await this.view(checked.id),
          checkoutUrl: checked.checkoutUrl,
          returnUrl,
        };
      }
      await this.closeOpen([checked.id], 'REPLACED');
    }

    const gateway = this.gateways.active();
    let payment: Payment;
    try {
      payment = await this.prisma.$transaction(async (tx) => {
        const created = await tx.payment.create({
          data: {
            invoiceNo: await this.readableIds.nextReference('PAYMENT', tx),
            payerUserId: userId,
            patientId: item.patientId,
            purpose: input.purpose,
            referenceId: input.referenceId,
            providerId: item.providerId,
            description: item.description,
            amount: new Prisma.Decimal(payAmount),
            listAmount: new Prisma.Decimal(item.amount),
            discountAmount: new Prisma.Decimal(discount),
            gateway: gateway.name,
          },
        });
        if (claimId) {
          await this.coupons.reserve(tx, { claimId, paymentId: created.id, discountAmount: discount });
        }
        return created;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        // Another device started paying for the same thing at the same moment.
        throw new AppException(
          PaymentsErrorCode.PAYMENT_NOT_ALLOWED,
          'A payment for this is already in progress',
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }

    const account = await this.accounts.findById(userId);
    const callbackBase = this.config.payments.callbackBaseUrl;
    const slug = gateway.name.toLowerCase();
    try {
      const checkout = await gateway.createCheckout({
        paymentId: payment.id,
        invoiceNo: payment.invoiceNo,
        amount: payAmount,
        description: item.description,
        customer: {
          name: item.payerName,
          email: account?.email ?? 'no-reply@daily-health.local',
          phone: PLACEHOLDER_PHONE,
          address: item.city ?? 'Dhaka',
          city: item.city ?? 'Dhaka',
        },
        returnUrl: `${callbackBase}/payments/return/${slug}`,
        ipnUrl: `${callbackBase}/payments/ipn/${slug}`,
        clientIp,
      });
      payment = await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          gatewayPaymentId: checkout.gatewayPaymentId,
          checkoutUrl: checkout.checkoutUrl,
          checkoutExpiresAt: checkout.expiresAt,
          transactions: {
            create: transactionRow('INITIATE', checkout.exchange, {
              gatewayPaymentId: checkout.gatewayPaymentId,
              status: 'CREATED',
            }),
          },
        },
      });
      const full = await this.prisma.payment.findUniqueOrThrow({
        where: { id: payment.id },
        include: PAYMENT_INCLUDE,
      });
      return { payment: toPaymentResponse(full), checkoutUrl: checkout.checkoutUrl, returnUrl };
    } catch (error) {
      await this.prisma.$transaction(async (tx) => {
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: 'FAILED', failureReason: 'CHECKOUT_FAILED' },
        });
        await this.coupons.release(tx, payment.id);
      });
      if (error instanceof GatewayUnavailableError) {
        this.logger.warn(error.message);
        throw new AppException(
          PaymentsErrorCode.PAYMENT_GATEWAY_UNAVAILABLE,
          'The payment gateway is not available right now',
          HttpStatus.BAD_GATEWAY,
        );
      }
      throw error;
    }
  }

  /**
   * The payer is sent back here (return URL) or the gateway calls server to
   * server (IPN). Returns the payment, or null for a callback we do not know.
   */
  async handleCallback(
    gatewaySlug: string,
    params: Record<string, string>,
    kind: 'RETURN' | 'IPN',
  ): Promise<Payment | null> {
    const gateway = this.gateways.bySlug(gatewaySlug);
    const reference = gateway?.callbackReference(params);
    if (!gateway || !reference) return null;
    const payment = await this.prisma.payment.findFirst({
      where: reference.gatewayPaymentId
        ? { gatewayPaymentId: reference.gatewayPaymentId }
        : { invoiceNo: reference.invoiceNo },
    });
    if (!payment || payment.gateway !== gateway.name) return null;
    await this.prisma.gatewayTransaction.create({
      data: {
        paymentId: payment.id,
        ...transactionRow(kind, { request: params, response: null }, {
          gatewayPaymentId: payment.gatewayPaymentId,
          status: params.status ?? null,
        }),
      },
    });
    return this.finalize(payment, 'VERIFY');
  }

  /** The app asks after returning from the gateway (the IPN may be late). */
  async checkForPayer(userId: string, paymentId: string): Promise<PaymentResponse> {
    const payment = await this.requireForPayer(userId, paymentId);
    const checked = await this.finalize(payment, 'VERIFY');
    return this.view(checked.id);
  }

  async getForPayer(userId: string, paymentId: string): Promise<PaymentResponse> {
    const payment = await this.requireForPayer(userId, paymentId);
    return this.view(payment.id);
  }

  /** A profile's payment history (receipts). */
  async listForProfile(
    access: ProfileAccess,
    query: PaginationQuery,
  ): Promise<PaginatedResponse<PaymentResponse>> {
    const rows = await this.prisma.payment.findMany({
      where: {
        patientId: access.profile.id,
        status: { in: ['SUCCESS', 'REFUNDED', 'PARTIALLY_REFUNDED'] },
        ...afterCursor('createdAt', query.cursor),
      },
      include: PAYMENT_INCLUDE,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    return toKeysetPage(rows, query.limit, (row) => row.createdAt, toPaymentResponse);
  }

  /**
   * Development and staging only: the real success path (earnings, event,
   * receipt) without a gateway, for scripts and offline work.
   */
  async simulateSuccess(userId: string, paymentId: string): Promise<PaymentResponse> {
    if (this.config.isProduction) {
      throw new AppException(
        PaymentsErrorCode.DEV_PAYMENT_DISABLED,
        'Not available in production',
        HttpStatus.FORBIDDEN,
      );
    }
    const payment = await this.requireForPayer(userId, paymentId);
    await this.applyVerification(payment, {
      state: 'PAID',
      amount: Number(payment.amount),
      gatewayTrxId: `DEV-${payment.invoiceNo}`,
      method: 'OTHER',
      gatewayStatus: 'DEV_SIMULATED',
      exchange: { request: null, response: { simulated: true } },
    });
    return this.view(payment.id);
  }

  /**
   * The paid payment (with refund state) of each reference, for other modules'
   * responses (an appointment shows its receipt and refund).
   */
  async summariesForReferences(
    purpose: Payment['purpose'],
    referenceIds: string[],
  ): Promise<Map<string, PaymentSummary>> {
    if (referenceIds.length === 0) return new Map();
    const rows = await this.prisma.payment.findMany({
      where: {
        purpose,
        referenceId: { in: [...new Set(referenceIds)] },
        status: { in: ['SUCCESS', 'REFUNDED', 'PARTIALLY_REFUNDED'] },
      },
      include: PAYMENT_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
    const result = new Map<string, PaymentSummary>();
    for (const row of rows) {
      const refund = row.refunds.at(-1) ?? null;
      result.set(row.referenceId, {
        paymentId: row.id,
        invoiceNo: row.invoiceNo,
        method: row.method,
        paidAt: row.paidAt?.toISOString() ?? null,
        refund: refund ? { amount: refund.amount.toNumber(), status: refund.status } : null,
      });
    }
    return result;
  }

  /** Reconciliation job: unfinished checkouts are checked, old ones closed. */
  async reconcileOpenPayments(): Promise<number> {
    const open = await this.prisma.payment.findMany({
      where: {
        status: 'INITIATED',
        createdAt: { lt: new Date(Date.now() - 3 * 60_000) },
      },
      take: 100,
      orderBy: { createdAt: 'asc' },
    });
    for (const payment of open) {
      try {
        const checked = await this.finalize(payment, 'VERIFY');
        if (
          checked.status === 'INITIATED' &&
          Date.now() - checked.createdAt.getTime() > ABANDONED_AFTER_MS
        ) {
          await this.closeOpen([checked.id], 'ABANDONED');
        }
      } catch (error) {
        this.logger.warn(`Reconcile ${payment.invoiceNo}: ${(error as Error).message}`);
      }
    }
    return open.length;
  }

  /** Asks the gateway and applies the answer. Gateway errors leave the payment as is. */
  async finalize(payment: Payment, kind: GatewayTransactionKind): Promise<Payment> {
    if (payment.status === 'SUCCESS' || payment.status === 'REFUNDED' || payment.status === 'PARTIALLY_REFUNDED') {
      return payment;
    }
    const gateway: PaymentGateway = this.gateways.byName(payment.gateway);
    let result: VerifyResult;
    try {
      result = await gateway.verify({
        gatewayPaymentId: payment.gatewayPaymentId,
        invoiceNo: payment.invoiceNo,
      });
    } catch (error) {
      this.logger.warn(`Verify ${payment.invoiceNo}: ${(error as Error).message}`);
      return payment;
    }
    await this.prisma.gatewayTransaction.create({
      data: {
        paymentId: payment.id,
        ...transactionRow(kind, result.exchange, {
          gatewayPaymentId: payment.gatewayPaymentId,
          gatewayTrxId: result.gatewayTrxId,
          status: result.gatewayStatus,
        }),
      },
    });
    return this.applyVerification(payment, result);
  }

  private async applyVerification(payment: Payment, result: VerifyResult): Promise<Payment> {
    if (result.state === 'PENDING') return payment;
    if (result.state !== 'PAID') {
      await this.prisma.$transaction(async (tx) => {
        const closed = await tx.payment.updateMany({
          where: { id: payment.id, status: 'INITIATED' },
          data: {
            status: result.state === 'CANCELLED' ? 'CANCELLED' : 'FAILED',
            failureReason: result.gatewayStatus.slice(0, 200),
          },
        });
        if (closed.count === 1) await this.coupons.release(tx, payment.id);
      });
      return this.prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    }

    if (result.amount !== null && Math.abs(result.amount - Number(payment.amount)) > AMOUNT_TOLERANCE) {
      this.logger.error(
        `Amount mismatch on ${payment.invoiceNo}: expected ${payment.amount.toString()}, gateway ${result.amount}`,
      );
      await this.prisma.$transaction(async (tx) => {
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: 'FAILED', failureReason: 'AMOUNT_MISMATCH' },
        });
        await this.coupons.release(tx, payment.id);
      });
      return this.prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    }

    const outcome = await this.prisma.$transaction(async (tx) => {
      const current = await tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
      if (current.status === 'SUCCESS' || current.status === 'REFUNDED' || current.status === 'PARTIALLY_REFUNDED') {
        return { payment: current, newlyPaid: false, duplicate: false };
      }
      // Paid on an attempt we had closed (abandoned / replaced).
      const other = await tx.payment.findFirst({
        where: {
          purpose: current.purpose,
          referenceId: current.referenceId,
          status: { in: ['INITIATED', 'SUCCESS'] },
          id: { not: current.id },
        },
      });
      if (other?.status === 'INITIATED') {
        await tx.payment.update({
          where: { id: other.id },
          data: { status: 'CANCELLED', failureReason: 'PAID_ON_EARLIER_ATTEMPT' },
        });
        await this.coupons.release(tx, other.id);
      }
      const duplicate = other?.status === 'SUCCESS';
      const paid = await tx.payment.update({
        where: { id: current.id },
        data: {
          // A second payment for something already paid is kept apart and refunded.
          status: duplicate ? 'REFUNDED' : 'SUCCESS',
          refundedAmount: duplicate ? current.amount : undefined,
          paidAt: new Date(),
          method: result.method,
          gatewayTrxId: result.gatewayTrxId,
          failureReason: duplicate ? 'DUPLICATE_PAYMENT' : null,
        },
      });
      if (duplicate) {
        await tx.refund.create({
          data: {
            paymentId: paid.id,
            amount: paid.amount,
            reason: 'একই জিনিসের জন্য দুবার পেমেন্ট',
            requestedBy: 'SYSTEM',
          },
        });
        // Refunded in full, so its coupon use goes back.
        await this.coupons.release(tx, paid.id);
      } else {
        await this.coupons.markUsed(tx, paid.id);
        await this.recordEarning(tx, paid);
      }
      return { payment: paid, newlyPaid: !duplicate, duplicate };
    });

    if (outcome.duplicate) {
      this.logger.warn(`Duplicate payment ${payment.invoiceNo}: refund requested`);
    }
    if (outcome.newlyPaid) {
      await this.events.emitAsync(PAYMENT_SUCCEEDED_EVENT, {
        purpose: outcome.payment.purpose,
        referenceId: outcome.payment.referenceId,
        paymentId: outcome.payment.id,
      } satisfies PaymentSucceededEvent);
      await this.sendReceipt(outcome.payment);
    }
    return outcome.payment;
  }

  /**
   * A paid item got its provider later (a doctor took a quick consult): set
   * the payment's provider and credit the earning, once.
   */
  @OnEvent(PAYMENT_PROVIDER_ASSIGNED_EVENT, { async: true, promisify: true })
  async onProviderAssigned(event: PaymentProviderAssignedEvent): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findFirst({
        where: {
          purpose: event.purpose,
          referenceId: event.referenceId,
          status: 'SUCCESS',
          providerId: null,
        },
      });
      if (!payment) return;
      const claimed = await tx.payment.updateMany({
        where: { id: payment.id, providerId: null },
        data: { providerId: event.providerId },
      });
      if (claimed.count === 0) return;
      await this.recordEarning(tx, { ...payment, providerId: event.providerId });
    });
  }

  /**
   * The provider's share; the platform keeps PLATFORM_FEE_PERCENT. Worked out from the
   * list price: a coupon discount comes out of the platform's side, not the provider's.
   */
  private async recordEarning(tx: Tx, payment: Payment): Promise<void> {
    if (!payment.providerId) return;
    const gross = payment.listAmount;
    const fee = gross
      .mul(this.config.payments.platformFeePercent)
      .div(100)
      .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    await tx.providerEarning.create({
      data: {
        providerId: payment.providerId,
        paymentId: payment.id,
        kind: 'EARNING',
        gross,
        platformFee: fee,
        net: gross.minus(fee),
      },
    });
  }

  private async sendReceipt(payment: Payment): Promise<void> {
    await this.delivery.deliver([
      {
        userId: payment.payerUserId,
        patientId: payment.patientId,
        type: 'payment.succeeded',
        title: 'পেমেন্ট সফল হয়েছে',
        body: `৳${toBanglaDigits(Number(payment.amount).toFixed(0))} · রসিদ ${payment.invoiceNo}`,
        data: { screen: 'payments', profileId: payment.patientId, paymentId: payment.id },
        channels: ['PUSH', 'IN_APP'],
      },
    ]);
  }

  /** Closes unfinished checkouts and gives their coupon uses back. */
  private async closeOpen(paymentIds: string[], reason: 'REPLACED' | 'ABANDONED'): Promise<void> {
    for (const id of paymentIds) {
      await this.prisma.$transaction(async (tx) => {
        const closed = await tx.payment.updateMany({
          where: { id, status: 'INITIATED' },
          data: { status: 'CANCELLED', failureReason: reason },
        });
        if (closed.count === 1) await this.coupons.release(tx, id);
      });
    }
  }

  private async requireForPayer(userId: string, paymentId: string): Promise<Payment> {
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, payerUserId: userId },
    });
    if (!payment) {
      throw new AppException(
        PaymentsErrorCode.PAYMENT_NOT_FOUND,
        'Payment not found',
        HttpStatus.NOT_FOUND,
      );
    }
    return payment;
  }

  private async view(paymentId: string): Promise<PaymentResponse> {
    const payment = await this.prisma.payment.findUniqueOrThrow({
      where: { id: paymentId },
      include: PAYMENT_INCLUDE,
    });
    return toPaymentResponse(payment);
  }
}

function alreadyPaid(): AppException {
  return new AppException(
    PaymentsErrorCode.ALREADY_PAID,
    'Already paid',
    HttpStatus.CONFLICT,
  );
}

/** A GatewayTransaction row from one exchange. */
export function transactionRow(
  kind: GatewayTransactionKind,
  exchange: GatewayExchange,
  ids: { gatewayPaymentId?: string | null; gatewayTrxId?: string | null; status?: string | null },
) {
  return {
    kind,
    gatewayPaymentId: ids.gatewayPaymentId ?? null,
    gatewayTrxId: ids.gatewayTrxId ?? null,
    status: ids.status ?? null,
    rawRequest: (exchange.request ?? Prisma.JsonNull) as Prisma.InputJsonValue,
    rawResponse: (exchange.response ?? Prisma.JsonNull) as Prisma.InputJsonValue,
  };
}
