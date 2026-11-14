import { apiRequest } from './http-client';
import { buildQuery } from './query-string';

import type { PaginatedResponse } from '@/shared-contracts/common-fields.contract';
import type {
  PaymentResponse,
  StartPaymentRequest,
  StartPaymentResponse,
} from '@/shared-contracts/payments.contract';

const auth = { authenticated: true } as const;

/** Paying through the gateway (shurjoPay / SSLCommerz) and receipts. */
export const paymentsEndpoints = {
  start: (body: StartPaymentRequest) =>
    apiRequest<StartPaymentResponse>('/payments', { ...auth, method: 'POST', body }),
  get: (paymentId: string) => apiRequest<PaymentResponse>(`/payments/${paymentId}`, auth),
  /** Asks the gateway now (after returning from its page). */
  check: (paymentId: string) =>
    apiRequest<PaymentResponse>(`/payments/${paymentId}/check`, { ...auth, method: 'POST' }),
  listForProfile: (profileId: string, cursor?: string) =>
    apiRequest<PaginatedResponse<PaymentResponse>>(
      `/profiles/${profileId}/payments${buildQuery({ cursor, limit: 20 })}`,
      auth
    ),
};
