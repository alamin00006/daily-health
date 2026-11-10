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
/** shurjoPay tokens (and checkout pages) last 15 minutes; renew a little early. */
const TOKEN_MARGIN_MS = 60_000;

interface TokenResponse {
  token?: string;
  store_id?: number | string;
  token_type?: string;
  expires_in?: number;
  sp_code?: string | number;
  message?: string;
}

interface SecretPayResponse {
  checkout_url?: string;
  sp_order_id?: string;
  transactionStatus?: string;
  message?: string;
  sp_code?: string | number;
}

interface VerificationRow {
  order_id?: string;
  customer_order_id?: string;
  amount?: string;
  payable_amount?: string;
  recived_amount?: string | null;
  received_amount?: string | null;
  bank_trx_id?: string | null;
  sp_code?: string | number;
  sp_message?: string;
  transaction_status?: string;
  method?: string | null;
}

/**
 * shurjoPay v2 (https://shurjopay.com.bd): get_token → secret-pay →
 * verification. sp_code 1000 = paid, 1001 = declined, 1002 = cancelled,
 * anything else (1068 "initiated", …) = not finished yet. shurjoPay
 * publishes no refund API, so refunds go to an admin.
 */
@Injectable()
export class ShurjoPayGatewayService extends PaymentGateway {
  readonly name = 'SHURJOPAY' as const;
  readonly supportsRefundApi = false;
  private readonly logger = new Logger(ShurjoPayGatewayService.name);
  private cachedToken: {
    token: string;
    tokenType: string;
    storeId: string;
    expiresAt: number;
  } | null = null;

  constructor(private readonly config: AppConfigService) {
    super();
  }

  private get settings() {
    return this.config.payments.shurjoPay;
  }

  async createCheckout(request: CheckoutRequest): Promise<CheckoutResult> {
    const auth = await this.token();
    const body = {
      prefix: this.settings.prefix,
      token: auth.token,
      return_url: request.returnUrl,
      cancel_url: request.returnUrl,
      store_id: auth.storeId,
      amount: request.amount,
      order_id: request.invoiceNo,
      currency: 'BDT',
      customer_name: request.customer.name,
      customer_address: request.customer.address,
      customer_email: request.customer.email,
      customer_phone: request.customer.phone,
      customer_city: request.customer.city,
      customer_post_code: '1000',
      customer_country: 'Bangladesh',
      client_ip: request.clientIp ?? '127.0.0.1',
      // Echoed back in verification: lets support find the payment.
      value1: request.paymentId,
      value2: request.description.slice(0, 100),
    };
    const response = await this.post<SecretPayResponse>(
      '/secret-pay',
      body,
      auth,
    );
    if (!response.checkout_url || !response.sp_order_id) {
      throw new GatewayUnavailableError(
        this.name,
        `secret-pay returned no checkout (${response.message ?? response.sp_code ?? 'unknown'})`,
      );
    }
    return {
      gatewayPaymentId: response.sp_order_id,
      checkoutUrl: response.checkout_url,
      expiresAt: new Date(auth.expiresAt),
      exchange: { request: withoutSecrets(body), response },
    };
  }

  /** shurjoPay appends `?order_id=<sp_order_id>` to the return URL. */
  callbackReference(params: Record<string, string>): CallbackReference | null {
    const orderId = params.order_id ?? params.sp_order_id;
    return orderId ? { gatewayPaymentId: orderId } : null;
  }

  async verify(reference: {
    gatewayPaymentId: string | null;
    invoiceNo: string;
  }): Promise<VerifyResult> {
    if (!reference.gatewayPaymentId) {
      return {
        state: 'FAILED',
        amount: null,
        gatewayTrxId: null,
        method: null,
        gatewayStatus: 'NO_CHECKOUT',
        exchange: { request: null, response: null },
      };
    }
    const auth = await this.token();
    const body = { order_id: reference.gatewayPaymentId };
    const response = await this.post<VerificationRow[] | VerificationRow>(
      '/verification',
      body,
      auth,
    );
    const row = Array.isArray(response) ? response[0] : response;
    const code = String(row?.sp_code ?? '');
    const state =
      code === '1000'
        ? 'PAID'
        : code === '1001'
          ? 'FAILED'
          : code === '1002'
            ? 'CANCELLED'
            : 'PENDING';
    const amount = Number(row?.payable_amount ?? row?.amount ?? NaN);
    return {
      state,
      amount: state === 'PAID' && Number.isFinite(amount) ? amount : null,
      gatewayTrxId: row?.bank_trx_id ?? null,
      method: state === 'PAID' ? methodFromGatewayText(row?.method) : null,
      gatewayStatus: `${code} ${row?.sp_message ?? row?.transaction_status ?? ''}`.trim(),
      exchange: { request: body, response },
    };
  }

  /** No refund API: the admin refunds in shurjoPay's merchant panel and marks it processed. */
  refund(request: RefundRequest): Promise<RefundResult> {
    return Promise.resolve({
      state: 'REQUESTED',
      gatewayRefundId: null,
      reason: 'MANUAL_REFUND_REQUIRED',
      exchange: {
        request: { invoiceNo: request.invoiceNo, amount: request.amount },
        response: null,
      },
    });
  }

  refundStatus(gatewayRefundId: string): Promise<RefundResult> {
    return Promise.resolve({
      state: 'REQUESTED',
      gatewayRefundId,
      reason: 'MANUAL_REFUND_REQUIRED',
      exchange: { request: null, response: null },
    });
  }

  private async token() {
    if (this.cachedToken && this.cachedToken.expiresAt - TOKEN_MARGIN_MS > Date.now()) {
      return this.cachedToken;
    }
    const response = await this.post<TokenResponse>('/get_token', {
      username: this.settings.username,
      password: this.settings.password,
    });
    if (!response.token) {
      throw new GatewayUnavailableError(
        this.name,
        `get_token failed (${response.message ?? response.sp_code ?? 'no token'})`,
      );
    }
    // expires_in is in seconds (900 in the sandbox); never trust more than 15 min.
    const seconds = Math.min(Number(response.expires_in ?? 900) || 900, 900);
    this.cachedToken = {
      token: response.token,
      tokenType: response.token_type ?? 'Bearer',
      storeId: String(response.store_id ?? ''),
      expiresAt: Date.now() + seconds * 1000,
    };
    return this.cachedToken;
  }

  private async post<T>(
    path: string,
    body: Record<string, unknown>,
    auth?: { token: string; tokenType: string },
  ): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.settings.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(auth ? { Authorization: `${auth.tokenType} ${auth.token}` } : {}),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      throw new GatewayUnavailableError(this.name, `${path}: ${(error as Error).message}`);
    }
    if (res.status === 401 && auth) this.cachedToken = null;
    if (!res.ok) {
      this.logger.warn(`shurjoPay ${path} answered ${res.status}`);
      throw new GatewayUnavailableError(this.name, `${path} answered ${res.status}`);
    }
    return (await res.json()) as T;
  }
}
