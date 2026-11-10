import { z } from 'zod';
import {
  calendarDateSchema,
  paginationQuerySchema,
} from './common-fields.contract.js';

export const paymentPurposeSchema = z.enum([
  'APPOINTMENT',
  'QUICK_CONSULT',
  'DIET_PLAN',
]);
export type PaymentPurpose = z.infer<typeof paymentPurposeSchema>;

export type PaymentGatewayName = 'SHURJOPAY' | 'SSLCOMMERZ';
export type PaymentMethod =
  | 'BKASH'
  | 'NAGAD'
  | 'ROCKET'
  | 'UPAY'
  | 'CARD'
  | 'OTHER';
export type PaymentStatus =
  | 'INITIATED'
  | 'SUCCESS'
  | 'FAILED'
  | 'CANCELLED'
  | 'REFUNDED'
  | 'PARTIALLY_REFUNDED';
export type RefundStatus = 'REQUESTED' | 'PROCESSED' | 'FAILED';
export const payoutMethodSchema = z.enum(['BKASH', 'NAGAD', 'BANK']);
export type PayoutMethod = z.infer<typeof payoutMethodSchema>;
export type PayoutStatus = 'PENDING' | 'PAID' | 'CANCELLED';

// ---------------------------------------------------------------------------
// Paying (patient side)
// ---------------------------------------------------------------------------

// POST /api/v1/payments — opens the gateway's checkout for something payable.
export const startPaymentRequestSchema = z.object({
  purpose: paymentPurposeSchema,
  /** The appointment (or consultation) id. */
  referenceId: z.uuid(),
});
export type StartPaymentRequest = z.infer<typeof startPaymentRequestSchema>;

export interface RefundSummary {
  id: string;
  amount: number;
  status: RefundStatus;
  reason: string;
  createdAt: string;
  processedAt: string | null;
}

export interface PaymentResponse {
  id: string;
  /** "RC-2611-0042": the receipt number. */
  invoiceNo: string;
  purpose: PaymentPurpose;
  referenceId: string;
  patientId: string;
  description: string;
  amount: number;
  currency: 'BDT';
  gateway: PaymentGatewayName;
  /** bKash, Nagad, card…: known once paid. */
  method: PaymentMethod | null;
  status: PaymentStatus;
  /** The wallet / bank transaction id. */
  gatewayTrxId: string | null;
  paidAt: string | null;
  refundedAmount: number;
  refunds: RefundSummary[];
  createdAt: string;
}

export interface StartPaymentResponse {
  payment: PaymentResponse;
  /** Open in the browser; the gateway sends the payer back to `returnUrl`. */
  checkoutUrl: string;
  /**
   * The deep link the return page redirects to when done
   * (`dailyhealth://payment-result?paymentId=…&status=…`): the app waits for it.
   */
  returnUrl: string;
}

// GET /api/v1/profiles/:profileId/payments
export const listPaymentsQuerySchema = paginationQuerySchema;

// ---------------------------------------------------------------------------
// Provider: earnings and payouts (web panel)
// ---------------------------------------------------------------------------

export interface EarningsSummaryResponse {
  /** Earned, not yet in a payout (refund adjustments included). */
  unsettled: number;
  /** In payouts created but not paid yet. */
  inPendingPayouts: number;
  /** All paid payouts. */
  paidOut: number;
  /** This month's net earnings (Asia/Dhaka). */
  thisMonth: number;
  platformFeePercent: number;
}

export interface EarningResponse {
  id: string;
  kind: 'EARNING' | 'REFUND_ADJUSTMENT';
  invoiceNo: string;
  description: string;
  gross: number;
  platformFee: number;
  net: number;
  payoutNo: string | null;
  createdAt: string;
}

// GET /api/v1/provider/me/earnings
export const listEarningsQuerySchema = paginationQuerySchema;

export interface PayoutResponse {
  id: string;
  /** "ST-2611-0003" */
  payoutNo: string;
  providerId: string;
  providerName: string;
  providerCode: string;
  periodStart: string;
  periodEnd: string;
  amount: number;
  method: PayoutMethod;
  accountMasked: string;
  status: PayoutStatus;
  reference: string | null;
  paidAt: string | null;
  earningsCount: number;
  createdAt: string;
}

// PUT /api/v1/provider/me/payout-account
export const payoutAccountRequestSchema = z
  .object({
    method: payoutMethodSchema,
    accountName: z.string().trim().min(2).max(100),
    /** bKash/Nagad: the 11-digit number; bank: the account number. */
    accountNumber: z
      .string()
      .trim()
      .transform((raw) =>
        raw.replace(/[০-৯]/g, (d) => String('০১২৩৪৫৬৭৮৯'.indexOf(d))).replace(/[\s-]/g, ''),
      )
      .pipe(z.string().regex(/^\d{8,20}$/, 'Digits only')),
    bankName: z.string().trim().max(80).optional(),
    branchName: z.string().trim().max(80).optional(),
    routingNumber: z
      .string()
      .trim()
      .regex(/^\d{9}$/, '9-digit routing number')
      .optional(),
  })
  .superRefine((body, ctx) => {
    if (body.method === 'BANK') {
      if (!body.bankName)
        ctx.addIssue({ code: 'custom', path: ['bankName'], message: 'Required' });
      if (!body.branchName)
        ctx.addIssue({ code: 'custom', path: ['branchName'], message: 'Required' });
    } else if (!/^01[3-9]\d{8}$/.test(body.accountNumber)) {
      ctx.addIssue({
        code: 'custom',
        path: ['accountNumber'],
        message: 'An 11-digit mobile number (01XXXXXXXXX)',
      });
    }
  });
export type PayoutAccountRequest = z.infer<typeof payoutAccountRequestSchema>;

export interface PayoutAccountResponse {
  method: PayoutMethod;
  accountName: string;
  /** "XXXXXXX4521" */
  accountMasked: string;
  bankName: string | null;
  branchName: string | null;
  routingNumber: string | null;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Admin: refunds and payouts
// ---------------------------------------------------------------------------

// GET /api/v1/admin/refunds?status=REQUESTED
export const listRefundsQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['REQUESTED', 'PROCESSED', 'FAILED']).default('REQUESTED'),
});
export type ListRefundsQuery = z.infer<typeof listRefundsQuerySchema>;

export interface AdminRefundResponse extends RefundSummary {
  invoiceNo: string;
  paymentId: string;
  description: string;
  gateway: PaymentGatewayName;
  method: PaymentMethod | null;
  gatewayTrxId: string | null;
  gatewayRefundId: string | null;
  failureReason: string | null;
  /** False: the gateway has no refund API; refund in its merchant panel, then mark processed. */
  automatic: boolean;
}

// POST /api/v1/admin/refunds/:refundId/mark-processed
export const markRefundProcessedRequestSchema = z.object({
  /** The refund id from the gateway's merchant panel. */
  gatewayRefundId: z.string().trim().min(2).max(100),
});
export type MarkRefundProcessedRequest = z.infer<
  typeof markRefundProcessedRequestSchema
>;

// GET /api/v1/admin/payouts/due?until=2026-11-30
export const payoutsDueQuerySchema = z.object({
  /** Earnings up to and including this Asia/Dhaka day. Defaults to yesterday. */
  until: calendarDateSchema.optional(),
});
export type PayoutsDueQuery = z.infer<typeof payoutsDueQuerySchema>;

export interface PayoutDueResponse {
  providerId: string;
  providerName: string;
  providerCode: string;
  amount: number;
  earningsCount: number;
  oldestEarningAt: string;
  /** null: the provider has not added where to be paid yet. */
  account: PayoutAccountResponse | null;
}

// POST /api/v1/admin/payouts
export const createPayoutRequestSchema = z.object({
  providerId: z.uuid(),
  until: calendarDateSchema,
});
export type CreatePayoutRequest = z.infer<typeof createPayoutRequestSchema>;

// GET /api/v1/admin/payouts?status=PENDING
export const listPayoutsQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['PENDING', 'PAID', 'CANCELLED']).optional(),
});
export type ListPayoutsQuery = z.infer<typeof listPayoutsQuerySchema>;

// POST /api/v1/admin/payouts/:payoutId/mark-paid
export const markPayoutPaidRequestSchema = z.object({
  /** bKash TrxID or bank reference. */
  reference: z.string().trim().min(3).max(100),
});
export type MarkPayoutPaidRequest = z.infer<typeof markPayoutPaidRequestSchema>;
