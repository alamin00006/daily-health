import { z } from 'zod';
import {
  calendarDateSchema,
  paginationQuerySchema,
} from './common-fields.contract.js';

export const paymentPurposeSchema = z.enum([
  'APPOINTMENT',
  'QUICK_CONSULT',
  'DIET_PLAN',
  /** A HealthStore order. */
  'ORDER',
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
  /** One of my coupons (GET /coupons/applicable); the platform pays the discount. */
  couponClaimId: z.uuid().optional(),
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
  /** What was charged: listAmount − discountAmount. */
  amount: number;
  /** The price before a coupon. */
  listAmount: number;
  discountAmount: number;
  /** The coupon used, if any. */
  couponCode: string | null;
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

// ---------------------------------------------------------------------------
// Coupons (Roadmap doc, 2026-11-26): admins make discount codes in the panel;
// people claim one in the sign-up form and spend it on a later payment.
// ---------------------------------------------------------------------------

/** "welcome-50 " → "WELCOME-50". Uppercase letters, digits and "-", 3–32 characters. */
export const couponCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9-]{3,32}$/, 'Letters, digits and "-" only, 3–32 characters');

const couponMoney = z.coerce.number().min(0).max(9_999_999).multipleOf(0.01);

export const couponDiscountTypeSchema = z.enum(['PERCENT', 'FLAT']);
export type CouponDiscountType = z.infer<typeof couponDiscountTypeSchema>;

// POST /api/v1/coupons/check (public: the sign-up form checks the code before sending it)
export const checkCouponRequestSchema = z.object({ code: couponCodeSchema });
export type CheckCouponRequest = z.infer<typeof checkCouponRequestSchema>;
/** Only for a usable code; anything else answers COUPON_INVALID / COUPON_EXPIRED / COUPON_LIMIT_REACHED. */
export interface CheckCouponResponse {
  code: string;
  title: string;
  discountType: CouponDiscountType;
  discountValue: number;
  maxDiscount: number | null;
  minAmount: number | null;
  appliesTo: PaymentPurpose[];
  endsAt: string | null;
}

// GET /api/v1/coupons/mine
export interface MyCouponResponse extends CheckCouponResponse {
  claimId: string;
  usesLeft: number;
  claimedAt: string;
  /** False once it ran out, expired or was switched off. */
  usable: boolean;
}

const couponFieldsSchema = z.object({
  title: z.string().trim().min(2).max(120),
  discountType: couponDiscountTypeSchema,
  discountValue: couponMoney.refine((v) => v > 0, 'Must be more than 0'),
  maxDiscount: couponMoney.refine((v) => v > 0, 'Must be more than 0').nullable(),
  minAmount: couponMoney.nullable(),
  appliesTo: z.array(paymentPurposeSchema).max(4),
  startsAt: z.iso.datetime({ offset: true }).nullable(),
  endsAt: z.iso.datetime({ offset: true }).nullable(),
  maxClaims: z.coerce.number().int().min(1).max(1_000_000).nullable(),
  usesPerClaim: z.coerce.number().int().min(1).max(100),
  isActive: z.boolean(),
});

const couponRules = <T extends Partial<z.infer<typeof couponFieldsSchema>>>(
  schema: z.ZodType<T>,
) =>
  schema
    .refine((c) => c.discountType !== 'PERCENT' || c.discountValue === undefined || c.discountValue <= 100, {
      path: ['discountValue'],
      message: 'A percentage cannot be more than 100',
    })
    .refine((c) => !c.startsAt || !c.endsAt || new Date(c.startsAt) < new Date(c.endsAt), {
      path: ['endsAt'],
      message: 'Must be after the start',
    });

// POST /api/v1/admin/coupons
export const createCouponRequestSchema = couponRules(
  couponFieldsSchema.extend({ code: couponCodeSchema }),
);
export type CreateCouponRequest = z.infer<typeof createCouponRequestSchema>;

// PATCH /api/v1/admin/coupons/:couponId (the code itself never changes)
export const updateCouponRequestSchema = couponRules(couponFieldsSchema.partial());
export type UpdateCouponRequest = z.infer<typeof updateCouponRequestSchema>;

// GET /api/v1/admin/coupons
export const listCouponsQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().max(32).optional(),
});
export type ListCouponsQuery = z.infer<typeof listCouponsQuerySchema>;

export interface AdminCouponResponse extends CheckCouponResponse {
  id: string;
  startsAt: string | null;
  maxClaims: number | null;
  claimCount: number;
  usesPerClaim: number;
  isActive: boolean;
  /** Paid payments that used it. */
  usedCount: number;
  /** What those discounts cost the platform, in BDT. */
  discountGiven: number;
  createdAt: string;
  updatedAt: string;
}

// GET /api/v1/coupons/applicable?purpose=&referenceId= — my coupons for this checkout
export const applicableCouponsQuerySchema = z.object({
  purpose: paymentPurposeSchema,
  referenceId: z.uuid(),
});
export type ApplicableCouponsQuery = z.infer<typeof applicableCouponsQuerySchema>;
export interface ApplicableCouponResponse {
  claimId: string;
  code: string;
  title: string;
  /** The price before the coupon. */
  listAmount: number;
  /** What this coupon takes off (0 when it does not apply). */
  discountAmount: number;
  /** What would be charged with it. */
  payAmount: number;
  /** Null when it can be used; otherwise why not. */
  notApplicableReason: 'MIN_AMOUNT' | 'PURPOSE' | 'TOO_SMALL' | null;
  usesLeft: number;
  endsAt: string | null;
}

/** The gateways take no less than this, so a coupon never brings a payment below it. */
export const MIN_CHARGE_BDT = 10;

export type CouponNotApplicableReason = ApplicableCouponResponse['notApplicableReason'];

/**
 * What a coupon takes off a price, or why it does not apply. The API decides at
 * checkout; the app uses the same rule to preview the discount.
 */
export function quoteCoupon(
  coupon: {
    discountType: CouponDiscountType;
    discountValue: number | { toString(): string };
    maxDiscount: number | { toString(): string } | null;
    minAmount: number | { toString(): string } | null;
    appliesTo: readonly PaymentPurpose[];
  },
  purpose: PaymentPurpose,
  listAmount: number,
): { discount: number; reason: CouponNotApplicableReason } {
  if (coupon.appliesTo.length > 0 && !coupon.appliesTo.includes(purpose)) {
    return { discount: 0, reason: 'PURPOSE' };
  }
  if (coupon.minAmount !== null && listAmount < Number(coupon.minAmount)) {
    return { discount: 0, reason: 'MIN_AMOUNT' };
  }
  const value = Number(coupon.discountValue);
  let raw = coupon.discountType === 'FLAT' ? value : (listAmount * value) / 100;
  if (coupon.maxDiscount !== null) raw = Math.min(raw, Number(coupon.maxDiscount));
  const discount = Math.floor(Math.min(raw, listAmount - MIN_CHARGE_BDT) * 100) / 100;
  return discount > 0 ? { discount, reason: null } : { discount: 0, reason: 'TOO_SMALL' };
}
