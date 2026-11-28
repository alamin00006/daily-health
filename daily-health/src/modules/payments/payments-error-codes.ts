/** Error codes of the payments module. The apps map each to Bangla text; never rename. */
export const PaymentsErrorCode = {
  PAYMENT_NOT_FOUND: 'PAYMENT_NOT_FOUND',
  /** The thing cannot be paid now (hold expired, already confirmed, cancelled). */
  PAYMENT_NOT_ALLOWED: 'PAYMENT_NOT_ALLOWED',
  ALREADY_PAID: 'ALREADY_PAID',
  /** The gateway is down or refused the checkout. */
  PAYMENT_GATEWAY_UNAVAILABLE: 'PAYMENT_GATEWAY_UNAVAILABLE',
  REFUND_NOT_FOUND: 'REFUND_NOT_FOUND',
  /** Already processed, or not waiting for this action. */
  REFUND_STATUS_CONFLICT: 'REFUND_STATUS_CONFLICT',
  PAYOUT_NOT_FOUND: 'PAYOUT_NOT_FOUND',
  PAYOUT_STATUS_CONFLICT: 'PAYOUT_STATUS_CONFLICT',
  /** Nothing unsettled to pay out for that period. */
  NOTHING_TO_PAY_OUT: 'NOTHING_TO_PAY_OUT',
  /** The provider has not added a payout account. */
  PAYOUT_ACCOUNT_MISSING: 'PAYOUT_ACCOUNT_MISSING',
  /** Development-only payment simulation used in production. */
  DEV_PAYMENT_DISABLED: 'DEV_PAYMENT_DISABLED',
  /** No active coupon with this code (also: not started yet, switched off). */
  COUPON_INVALID: 'COUPON_INVALID',
  COUPON_EXPIRED: 'COUPON_EXPIRED',
  /** maxClaims people already claimed it. */
  COUPON_LIMIT_REACHED: 'COUPON_LIMIT_REACHED',
  COUPON_ALREADY_CLAIMED: 'COUPON_ALREADY_CLAIMED',
  /** Wrong purpose, below minAmount, or nothing left to take off (details.reason). */
  COUPON_NOT_APPLICABLE: 'COUPON_NOT_APPLICABLE',
  /** Admin: another coupon has this code. */
  COUPON_CODE_TAKEN: 'COUPON_CODE_TAKEN',
  COUPON_NOT_FOUND: 'COUPON_NOT_FOUND',
} as const;
