import type {
  PaymentGatewayName,
  PaymentMethod,
} from '../../../shared-contracts/payments.contract.js';

export interface CheckoutCustomer {
  name: string;
  email: string;
  /** 11-digit local mobile number. */
  phone: string;
  address: string;
  city: string;
}

export interface CheckoutRequest {
  paymentId: string;
  /** "RC-2611-0042": our order id at the gateway. */
  invoiceNo: string;
  amount: number;
  description: string;
  customer: CheckoutCustomer;
  /** Where the gateway sends the payer back (success, failure and cancel). */
  returnUrl: string;
  /** Server-to-server notification. */
  ipnUrl: string;
  clientIp: string | null;
}

/** What we store about a call: never secrets (passwords, tokens). */
export interface GatewayExchange {
  request: Record<string, unknown> | null;
  response: unknown;
}

export interface CheckoutResult {
  /** The gateway's id for this checkout (shurjoPay sp_order_id, SSLCommerz sessionkey). */
  gatewayPaymentId: string;
  checkoutUrl: string;
  /** The checkout page stops working after this. */
  expiresAt: Date;
  exchange: GatewayExchange;
}

export type GatewayPaymentState = 'PAID' | 'PENDING' | 'FAILED' | 'CANCELLED';

export interface VerifyResult {
  state: GatewayPaymentState;
  /** What the gateway says was charged (null when not paid). */
  amount: number | null;
  gatewayTrxId: string | null;
  method: PaymentMethod | null;
  /** The gateway's own status, for the log and failureReason. */
  gatewayStatus: string;
  exchange: GatewayExchange;
}

export interface RefundRequest {
  gatewayPaymentId: string | null;
  gatewayTrxId: string | null;
  invoiceNo: string;
  amount: number;
  reason: string;
  /** Our refund id, for the gateway's reference field. */
  refundId: string;
}

export interface RefundResult {
  /** REQUESTED: accepted, still processing at the gateway. */
  state: 'PROCESSED' | 'REQUESTED' | 'FAILED';
  gatewayRefundId: string | null;
  reason: string | null;
  exchange: GatewayExchange;
}

/** Which payment a return or IPN call is about. */
export interface CallbackReference {
  gatewayPaymentId?: string;
  invoiceNo?: string;
}

/**
 * A payment aggregator. Everything outside `gateways/` talks to this class
 * only, so switching shurjoPay ↔ SSLCommerz is the PAYMENT_GATEWAY setting.
 * A payment is always verified with the gateway's own API: callbacks only
 * say *which* payment to check, never whether it was paid.
 */
export abstract class PaymentGateway {
  abstract readonly name: PaymentGatewayName;
  /** False: refunds are done by an admin in the gateway's merchant panel. */
  abstract readonly supportsRefundApi: boolean;

  abstract createCheckout(request: CheckoutRequest): Promise<CheckoutResult>;

  /** Reads which payment a return / IPN request refers to. */
  abstract callbackReference(params: Record<string, string>): CallbackReference | null;

  abstract verify(reference: {
    gatewayPaymentId: string | null;
    invoiceNo: string;
  }): Promise<VerifyResult>;

  abstract refund(request: RefundRequest): Promise<RefundResult>;

  /** For refunds left REQUESTED: has the gateway finished it? */
  abstract refundStatus(gatewayRefundId: string): Promise<RefundResult>;
}

/** The gateway is down or refused the call (502 to the app). */
export class GatewayUnavailableError extends Error {
  constructor(
    readonly gateway: PaymentGatewayName,
    message: string,
  ) {
    super(`${gateway}: ${message}`);
  }
}

/** "bKash", "BKASH-BKash", "Nagad", "VISA-Dutch Bangla" → our method. */
export function methodFromGatewayText(text: string | null | undefined): PaymentMethod | null {
  if (!text) return null;
  const value = text.toLowerCase();
  if (value.includes('bkash')) return 'BKASH';
  if (value.includes('nagad')) return 'NAGAD';
  if (value.includes('rocket') || value.includes('dbbl mobile')) return 'ROCKET';
  if (value.includes('upay')) return 'UPAY';
  if (/visa|master|amex|card|unionpay|nexus/.test(value)) return 'CARD';
  return 'OTHER';
}

/** Removes secrets before a gateway call is stored. */
export function withoutSecrets(
  body: Record<string, unknown>,
): Record<string, unknown> {
  const hidden = new Set(['password', 'store_passwd', 'token', 'username']);
  return Object.fromEntries(
    Object.entries(body).map(([key, value]) => [
      key,
      hidden.has(key) ? '[hidden]' : value,
    ]),
  );
}
