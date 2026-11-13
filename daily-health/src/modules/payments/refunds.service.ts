import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  APPOINTMENT_CANCELLED_EVENT,
  PAYMENT_REFUND_REQUESTED_EVENT,
  type AppointmentEvent,
  type PaymentRefundRequestedEvent,
} from '../../common/events/booking-events.js';
import { AppException } from '../../common/errors/app-exception.js';
import { toBanglaDigits } from '../../common/formatting/bangla-digits.js';
import {
  afterCursor,
  toKeysetPage,
} from '../../common/pagination/keyset-cursor.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { Prisma, type Refund } from '../../generated/prisma/client.js';
import type { PaginatedResponse } from '../../shared-contracts/common-fields.contract.js';
import type {
  AdminRefundResponse,
  ListRefundsQuery,
  PaymentPurpose,
} from '../../shared-contracts/payments.contract.js';
import { NotificationDeliveryService } from '../notifications/notification-delivery.service.js';
import type { RefundResult } from './gateways/payment-gateway.js';
import { PaymentGatewaysService } from './payment-gateways.service.js';
import { transactionRow } from './payments.service.js';
import { PaymentsErrorCode } from './payments-error-codes.js';

/** Marks a refund that was handed to an admin (gateway without a refund API). */
const MANUAL = 'MANUAL_REFUND_REQUIRED';

const REFUND_INCLUDE = { payment: true } satisfies Prisma.RefundInclude;
type RefundWithPayment = Prisma.RefundGetPayload<{ include: typeof REFUND_INCLUDE }>;

/**
 * Refunds (full, for now: the owner's default policy). Started by a
 * cancellation of a paid booking or a duplicate payment; sent to the gateway's
 * refund API when it has one (SSLCommerz), otherwise left for an admin to do
 * in the merchant panel (shurjoPay). When the money is back, the provider's
 * share is taken back with a negative REFUND_ADJUSTMENT earning, which the
 * next payout deducts (a paid payout is never edited).
 */
@Injectable()
export class RefundsService {
  private readonly logger = new Logger(RefundsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateways: PaymentGatewaysService,
    private readonly delivery: NotificationDeliveryService,
  ) {}

  @OnEvent(APPOINTMENT_CANCELLED_EVENT, { async: true, promisify: true })
  async onAppointmentCancelled(event: AppointmentEvent): Promise<void> {
    if (!event.wasConfirmed) return;
    const reason =
      event.cancelledBy === 'PROVIDER'
        ? 'ডাক্তার অ্যাপয়েন্টমেন্ট বাতিল করেছেন'
        : event.cancelledBy === 'SYSTEM'
          ? 'সিরিয়াল আর খালি ছিল না'
          : 'রোগী সময়মতো বাতিল করেছেন';
    await this.refundReference('APPOINTMENT', event.appointmentId, reason);
  }

  /** Full refund of the paid payment for something, if any. Idempotent. */
  @OnEvent(PAYMENT_REFUND_REQUESTED_EVENT, { async: true, promisify: true })
  async onRefundRequested(event: PaymentRefundRequestedEvent): Promise<void> {
    await this.refundReference(event.purpose, event.referenceId, event.reason);
  }

  async refundReference(
    purpose: PaymentPurpose,
    referenceId: string,
    reason: string,
  ): Promise<void> {
    const payment = await this.prisma.payment.findFirst({
      where: { purpose, referenceId, status: { in: ['SUCCESS', 'PARTIALLY_REFUNDED'] } },
      include: { refunds: true },
    });
    if (!payment) return;
    const open = payment.refunds
      .filter((r) => r.status !== 'FAILED')
      .reduce((sum, r) => sum.plus(r.amount), new Prisma.Decimal(0));
    const remaining = payment.amount.minus(open);
    if (remaining.lte(0)) return;
    const refund = await this.prisma.refund.create({
      data: {
        paymentId: payment.id,
        amount: remaining,
        reason,
        requestedBy: 'SYSTEM',
      },
    });
    await this.send(refund.id);
  }

  /** Sends a REQUESTED refund that has not been sent yet (job and duplicate payments). */
  async sendPending(): Promise<number> {
    const pending = await this.prisma.refund.findMany({
      where: { status: 'REQUESTED', gatewayRefundId: null, failureReason: null },
      take: 50,
    });
    for (const refund of pending) await this.send(refund.id);
    return pending.length;
  }

  /** Asks the gateway about refunds it accepted but has not finished. */
  async pollRequested(): Promise<number> {
    const waiting = await this.prisma.refund.findMany({
      where: { status: 'REQUESTED', gatewayRefundId: { not: null } },
      include: REFUND_INCLUDE,
      take: 50,
    });
    for (const refund of waiting) {
      const gateway = this.gateways.byName(refund.payment.gateway);
      if (!gateway.supportsRefundApi) continue;
      try {
        const result = await gateway.refundStatus(refund.gatewayRefundId!);
        await this.apply(refund, result);
      } catch (error) {
        this.logger.warn(`Refund status ${refund.id}: ${(error as Error).message}`);
      }
    }
    return waiting.length;
  }

  /** Refunds still waiting (an admin must refund shurjoPay ones by hand). */
  countOpen(): Promise<number> {
    return this.prisma.refund.count({ where: { status: 'REQUESTED' } });
  }

  async list(query: ListRefundsQuery): Promise<PaginatedResponse<AdminRefundResponse>> {
    const rows = await this.prisma.refund.findMany({
      where: { status: query.status, ...afterCursor('createdAt', query.cursor) },
      include: REFUND_INCLUDE,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    return toKeysetPage(rows, query.limit, (row) => row.createdAt, (row) => this.toAdmin(row));
  }

  /** The admin refunded in the gateway's merchant panel. */
  async markProcessed(
    adminUserId: string,
    refundId: string,
    gatewayRefundId: string,
  ): Promise<AdminRefundResponse> {
    const refund = await this.requireRefund(refundId);
    if (refund.status === 'PROCESSED') throw refundConflict();
    await this.prisma.refund.update({
      where: { id: refund.id },
      data: { gatewayRefundId, processedByUserId: adminUserId },
    });
    await this.apply(
      { ...refund, gatewayRefundId },
      { state: 'PROCESSED', gatewayRefundId, reason: null, exchange: { request: null, response: null } },
    );
    return this.toAdmin(await this.requireRefund(refundId));
  }

  /** Try a FAILED refund again. */
  async retry(refundId: string): Promise<AdminRefundResponse> {
    const refund = await this.requireRefund(refundId);
    if (refund.status !== 'FAILED') throw refundConflict();
    await this.prisma.refund.update({
      where: { id: refund.id },
      data: { status: 'REQUESTED', failureReason: null, gatewayRefundId: null },
    });
    await this.send(refund.id);
    return this.toAdmin(await this.requireRefund(refundId));
  }

  private async send(refundId: string): Promise<void> {
    const refund = await this.requireRefund(refundId);
    if (refund.status !== 'REQUESTED') return;
    const gateway = this.gateways.byName(refund.payment.gateway);
    try {
      const result = await gateway.refund({
        gatewayPaymentId: refund.payment.gatewayPaymentId,
        gatewayTrxId: refund.payment.gatewayTrxId,
        invoiceNo: refund.payment.invoiceNo,
        amount: refund.amount.toNumber(),
        reason: refund.reason,
        refundId: refund.id,
      });
      await this.prisma.gatewayTransaction.create({
        data: {
          paymentId: refund.paymentId,
          ...transactionRow('REFUND', result.exchange, {
            gatewayPaymentId: refund.payment.gatewayPaymentId,
            gatewayTrxId: refund.payment.gatewayTrxId,
            status: result.state,
          }),
        },
      });
      await this.apply(refund, result);
    } catch (error) {
      // Left REQUESTED: the job sends it again.
      this.logger.warn(`Refund ${refund.id}: ${(error as Error).message}`);
    }
  }

  private async apply(refund: Refund, result: RefundResult): Promise<void> {
    if (result.state === 'FAILED') {
      await this.prisma.refund.update({
        where: { id: refund.id },
        data: { status: 'FAILED', failureReason: (result.reason ?? 'FAILED').slice(0, 200) },
      });
      this.logger.error(`Refund ${refund.id} failed: ${result.reason ?? ''}`);
      return;
    }
    if (result.state === 'REQUESTED') {
      await this.prisma.refund.update({
        where: { id: refund.id },
        data: {
          gatewayRefundId: result.gatewayRefundId,
          failureReason: result.reason === MANUAL ? MANUAL : null,
        },
      });
      return;
    }

    const done = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.refund.updateMany({
        where: { id: refund.id, status: { not: 'PROCESSED' } },
        data: {
          status: 'PROCESSED',
          processedAt: new Date(),
          gatewayRefundId: result.gatewayRefundId ?? refund.gatewayRefundId,
          failureReason: null,
        },
      });
      if (claimed.count === 0) return null;
      const payment = await tx.payment.findUniqueOrThrow({ where: { id: refund.paymentId } });
      // A duplicate payment was already marked REFUNDED with its amount.
      const refunded =
        payment.status === 'REFUNDED'
          ? payment.refundedAmount
          : Prisma.Decimal.min(payment.amount, payment.refundedAmount.plus(refund.amount));
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          refundedAmount: refunded,
          status: refunded.gte(payment.amount) ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
        },
      });
      const earning = await tx.providerEarning.findFirst({
        where: { paymentId: payment.id, kind: 'EARNING' },
      });
      if (earning) {
        const share = refund.amount.div(payment.amount);
        const gross = earning.gross.mul(share).toDecimalPlaces(2).neg();
        const fee = earning.platformFee.mul(share).toDecimalPlaces(2).neg();
        await tx.providerEarning.create({
          data: {
            providerId: earning.providerId,
            paymentId: payment.id,
            refundId: refund.id,
            kind: 'REFUND_ADJUSTMENT',
            gross,
            platformFee: fee,
            net: gross.minus(fee),
          },
        });
      }
      return payment;
    });

    if (done) {
      await this.delivery.deliver([
        {
          userId: done.payerUserId,
          patientId: done.patientId,
          type: 'payment.refunded',
          title: 'টাকা ফেরত দেওয়া হয়েছে',
          body: `৳${toBanglaDigits(refund.amount.toFixed(0))} ফেরত গেছে (রসিদ ${done.invoiceNo})। ব্যাংক বা ওয়ালেটে পৌঁছাতে কয়েক দিন লাগতে পারে।`,
          data: { screen: 'payments', profileId: done.patientId, paymentId: done.id },
          channels: ['PUSH', 'IN_APP'],
        },
      ]);
    }
  }

  private async requireRefund(refundId: string): Promise<RefundWithPayment> {
    const refund = await this.prisma.refund.findUnique({
      where: { id: refundId },
      include: REFUND_INCLUDE,
    });
    if (!refund) {
      throw new AppException(
        PaymentsErrorCode.REFUND_NOT_FOUND,
        'Refund not found',
        HttpStatus.NOT_FOUND,
      );
    }
    return refund;
  }

  private toAdmin(refund: RefundWithPayment): AdminRefundResponse {
    return {
      id: refund.id,
      amount: refund.amount.toNumber(),
      status: refund.status,
      reason: refund.reason,
      createdAt: refund.createdAt.toISOString(),
      processedAt: refund.processedAt?.toISOString() ?? null,
      invoiceNo: refund.payment.invoiceNo,
      paymentId: refund.paymentId,
      description: refund.payment.description,
      gateway: refund.payment.gateway,
      method: refund.payment.method,
      gatewayTrxId: refund.payment.gatewayTrxId,
      gatewayRefundId: refund.gatewayRefundId,
      failureReason: refund.failureReason,
      automatic: this.gateways.byName(refund.payment.gateway).supportsRefundApi,
    };
  }
}

function refundConflict(): AppException {
  return new AppException(
    PaymentsErrorCode.REFUND_STATUS_CONFLICT,
    'The refund is not waiting for this',
    HttpStatus.CONFLICT,
  );
}
