import type { Prisma } from '../../generated/prisma/client.js';
import type { PaymentResponse } from '../../shared-contracts/payments.contract.js';

export const PAYMENT_INCLUDE = {
  refunds: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.PaymentInclude;

export type PaymentWithRefunds = Prisma.PaymentGetPayload<{
  include: typeof PAYMENT_INCLUDE;
}>;

export function toPaymentResponse(payment: PaymentWithRefunds): PaymentResponse {
  return {
    id: payment.id,
    invoiceNo: payment.invoiceNo,
    purpose: payment.purpose,
    referenceId: payment.referenceId,
    patientId: payment.patientId,
    description: payment.description,
    amount: payment.amount.toNumber(),
    currency: 'BDT',
    gateway: payment.gateway,
    method: payment.method,
    status: payment.status,
    gatewayTrxId: payment.gatewayTrxId,
    paidAt: payment.paidAt?.toISOString() ?? null,
    refundedAmount: payment.refundedAmount.toNumber(),
    refunds: payment.refunds.map((refund) => ({
      id: refund.id,
      amount: refund.amount.toNumber(),
      status: refund.status,
      reason: refund.reason,
      createdAt: refund.createdAt.toISOString(),
      processedAt: refund.processedAt?.toISOString() ?? null,
    })),
    createdAt: payment.createdAt.toISOString(),
  };
}
