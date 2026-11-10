import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../../../core/config/app-config.service.js';
import {
  GatewayUnavailableError,
  methodFromGatewayText,
  PaymentGateway,
  withoutSecrets,
  type CallbackReference,
  type CheckoutRequest,
  type CheckoutResult,
  type RefundRequest,
  type RefundResult,
  type VerifyResult,
} from './payment-gateway.js';

const REQUEST_TIMEOUT_MS = 20_000;
/** SSLCommerz sessions stay open for a while; our slot hold (10 min) is shorter anyway. */
const CHECKOUT_LIFETIME_MS = 30 * 60_000;

interface SessionResponse {
  status?: string;
  failedreason?: string;
  sessionkey?: string;
  GatewayPageURL?: string;
}

interface TransactionElement {
  val_id?: string;
  status?: string;
  tran_id?: string;
  amount?: string;
  currency_amount?: string;
  bank_tran_id?: string;
  card_type?: string;
  error?: string;
}

interface TransactionQueryResponse {
  APIConnect?: string;
  no_of_trans_found?: number;
  element?: TransactionElement[];
}

interface RefundResponse {
  APIConnect?: string;
  status?: string;
  refund_ref_id?: string;
  errorReason?: string;
  bank_tran_id?: string;
}

/**
 * SSLCommerz v4 (https://developer.sslcommerz.com): session API →
 * transaction query by tran_id (our invoiceNo) → refund API with status
 * query. VALID / VALIDATED = paid.
 */
@Injectable()
export class SslCommerzGatewayService extends PaymentGateway {
  readonly name = 'SSLCOMMERZ' as const;
  readonly supportsRefundApi = true;
  private readonly logger = new Logger(SslCommerzGatewayService.name);

  constructor(private readonly config: AppConfigService) {
    super();
  }

  private get settings() {
    return this.config.payments.sslCommerz;
  }

  private get credentials() {
    return {
      store_id: this.settings.storeId,
      store_passwd: this.settings.storePassword,
    };
  }

  async createCheckout(request: CheckoutRequest): Promise<CheckoutResult> {
    const body = {
      ...this.credentials,
      total_amount: request.amount.toFixed(2),
      currency: 'BDT',
      tran_id: request.invoiceNo,
      success_url: request.returnUrl,
      fail_url: request.returnUrl,
      cancel_url: request.returnUrl,
      ipn_url: request.ipnUrl,
      cus_name: request.customer.name,
      cus_email: request.customer.email,
      cus_add1: request.customer.address,
      cus_city: request.customer.city,
      cus_country: 'Bangladesh',
      cus_phone: request.customer.phone,
      shipping_method: 'NO',
      product_name: request.description.slice(0, 100),
      product_category: 'Healthcare',
      product_profile: 'non-physical-goods',
      value_a: request.paymentId,
    };
    const response = await this.request<SessionResponse>(
      'POST',
      '/gwprocess/v4/api.php',
      body,
    );
    if (response.status !== 'SUCCESS' || !response.GatewayPageURL || !response.sessionkey) {
      throw new GatewayUnavailableError(
        this.name,
        `session failed (${response.failedreason ?? response.status ?? 'unknown'})`,
      );
    }
    return {
      gatewayPaymentId: response.sessionkey,
      checkoutUrl: response.GatewayPageURL,
      expiresAt: new Date(Date.now() + CHECKOUT_LIFETIME_MS),
      exchange: { request: withoutSecrets(body), response },
    };
  }

  /** Success / fail / cancel / IPN all post `tran_id` (our invoiceNo). */
  callbackReference(params: Record<string, string>): CallbackReference | null {
    return params.tran_id ? { invoiceNo: params.tran_id } : null;
  }

  async verify(reference: {
    gatewayPaymentId: string | null;
    invoiceNo: string;
  }): Promise<VerifyResult> {
    const query = { ...this.credentials, tran_id: reference.invoiceNo, format: 'json' };
    const response = await this.request<TransactionQueryResponse>(
      'GET',
      '/validator/api/merchantTransIDvalidationAPI.php',
      query,
    );
    const elements = response.element ?? [];
    // A tran_id can have several attempts; a paid one wins.
    const paid = elements.find((e) => e.status === 'VALID' || e.status === 'VALIDATED');
    const latest = paid ?? elements.at(-1);
    const status = latest?.status ?? 'NOT_FOUND';
    const state = paid
      ? 'PAID'
      : status === 'FAILED'
        ? 'FAILED'
        : status === 'CANCELLED' || status === 'EXPIRED'
          ? 'CANCELLED'
          : 'PENDING';
    const amount = Number(paid?.currency_amount ?? paid?.amount ?? NaN);
    return {
      state,
      amount: paid && Number.isFinite(amount) ? amount : null,
      gatewayTrxId: paid?.bank_tran_id ?? null,
      method: paid ? methodFromGatewayText(paid.card_type) : null,
      gatewayStatus: status,
      exchange: { request: withoutSecrets(query), response },
    };
  }

  async refund(request: RefundRequest): Promise<RefundResult> {
    if (!request.gatewayTrxId) {
      return {
        state: 'FAILED',
        gatewayRefundId: null,
        reason: 'NO_BANK_TRANSACTION_ID',
        exchange: { request: null, response: null },
      };
    }
    const query = {
      ...this.credentials,
      bank_tran_id: request.gatewayTrxId,
      refund_amount: request.amount.toFixed(2),
      refund_remarks: request.reason.slice(0, 100),
      refe_id: request.refundId,
      format: 'json',
    };
    const response = await this.request<RefundResponse>(
      'GET',
      '/validator/api/merchantTransIDvalidationAPI.php',
      query,
    );
    const accepted = response.APIConnect === 'DONE' && response.status === 'success';
    return {
      state: accepted ? 'REQUESTED' : 'FAILED',
      gatewayRefundId: response.refund_ref_id ?? null,
      reason: accepted ? null : (response.errorReason ?? response.status ?? 'REFUND_REJECTED'),
      exchange: { request: withoutSecrets(query), response },
    };
  }

  async refundStatus(gatewayRefundId: string): Promise<RefundResult> {
    const query = { ...this.credentials, refund_ref_id: gatewayRefundId, format: 'json' };
    const response = await this.request<RefundResponse>(
      'GET',
      '/validator/api/merchantTransIDvalidationAPI.php',
      query,
    );
    const status = response.status ?? '';
    return {
      state: status === 'refunded' ? 'PROCESSED' : status === 'cancelled' ? 'FAILED' : 'REQUESTED',
      gatewayRefundId,
      reason: status === 'cancelled' ? (response.errorReason ?? 'cancelled') : null,
      exchange: { request: withoutSecrets(query), response },
    };
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    params: Record<string, string>,
  ): Promise<T> {
    const url = new URL(`${this.settings.baseUrl}${path}`);
    if (method === 'GET') {
      for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    }
    let res: Response;
    try {
      const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
      res =
        method === 'POST'
          ? await fetch(url, { method: 'POST', body: new URLSearchParams(params), signal })
          : await fetch(url, { signal });
    } catch (error) {
      throw new GatewayUnavailableError(this.name, `${path}: ${(error as Error).message}`);
    }
    if (!res.ok) {
      this.logger.warn(`SSLCommerz ${path} answered ${res.status}`);
      throw new GatewayUnavailableError(this.name, `${path} answered ${res.status}`);
    }
    return (await res.json()) as T;
  }
}
