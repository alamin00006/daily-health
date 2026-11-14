import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';

import { paymentsEndpoints } from '@/api/payments-endpoints';
import { queryKeys } from '@/api/query-keys';
import type {
  PaymentPurpose,
  PaymentResponse,
} from '@/shared-contracts/payments.contract';

export type PaymentOutcome =
  /** Paid and confirmed by the gateway. */
  | { kind: 'paid'; payment: PaymentResponse }
  /** Failed or cancelled at the gateway. */
  | { kind: 'failed'; payment: PaymentResponse }
  /** Closed the page before finishing, or the result is not in yet. */
  | { kind: 'pending'; payment: PaymentResponse };

/**
 * Pays for something through the gateway's page (bKash, Nagad, cards) in an
 * in-app browser. The API's return page redirects to the app's deep link,
 * which closes the browser; then the API is asked for the verified result.
 * The IPN and the server's reconciliation job finish it even if the phone
 * loses connection on the way back.
 */
export function usePayForItem(profileId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({
      purpose,
      referenceId,
    }: {
      purpose: PaymentPurpose;
      referenceId: string;
    }): Promise<PaymentOutcome> => {
      const started = await paymentsEndpoints.start({ purpose, referenceId });
      await WebBrowser.openAuthSessionAsync(started.checkoutUrl, started.returnUrl, {
        showTitle: true,
        enableBarCollapsing: true,
      });
      // Whatever the browser said, the API (verified with the gateway) decides.
      const payment = await paymentsEndpoints.check(started.payment.id);
      if (payment.status === 'SUCCESS') return { kind: 'paid', payment };
      if (payment.status === 'FAILED' || payment.status === 'CANCELLED') {
        return { kind: 'failed', payment };
      }
      return { kind: 'pending', payment };
    },
    onSettled: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: ['profile', profileId, 'appointment'] }),
        client.invalidateQueries({ queryKey: ['profile', profileId, 'appointments'] }),
        client.invalidateQueries({ queryKey: ['profile', profileId, 'payments'] }),
        // Quick consults move to WAITING once paid.
        client.invalidateQueries({ queryKey: ['consultation'] }),
        client.invalidateQueries({ queryKey: ['consultations'] }),
      ]),
  });
}

export function usePayments(profileId: string | undefined) {
  return useInfiniteQuery({
    queryKey: queryKeys.payments(profileId ?? ''),
    queryFn: ({ pageParam }) => paymentsEndpoints.listForProfile(profileId!, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.meta.hasMore ? (last.meta.cursor ?? undefined) : undefined),
    enabled: Boolean(profileId),
  });
}

export function usePayment(paymentId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.payment(paymentId ?? ''),
    queryFn: () => paymentsEndpoints.get(paymentId!),
    enabled: Boolean(paymentId),
  });
}
