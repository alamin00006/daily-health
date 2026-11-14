"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { PaginatedResponse } from "@/shared-contracts/common-fields.contract";
import type {
  AdminRefundResponse,
  EarningResponse,
  EarningsSummaryResponse,
  PayoutAccountRequest,
  PayoutAccountResponse,
  PayoutDueResponse,
  PayoutResponse,
  RefundStatus,
} from "@/shared-contracts/payments.contract";

const k = {
  summary: ["earnings", "summary"] as const,
  earnings: ["earnings", "list"] as const,
  myPayouts: ["earnings", "payouts"] as const,
  account: ["earnings", "account"] as const,
  refunds: (status: RefundStatus) => ["admin", "refunds", status] as const,
  due: (until: string) => ["admin", "payouts", "due", until] as const,
  payouts: (status: string) => ["admin", "payouts", "list", status] as const,
};

// --- Provider -----------------------------------------------------------------

export function useEarningsSummary() {
  return useQuery({ queryKey: k.summary, queryFn: () => api.get<EarningsSummaryResponse>("/provider/me/earnings/summary") });
}

export function useEarnings() {
  return useInfiniteQuery({
    queryKey: k.earnings,
    queryFn: ({ pageParam }) => api.get<PaginatedResponse<EarningResponse>>("/provider/me/earnings", { cursor: pageParam, limit: 20 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.meta.hasMore ? (last.meta.cursor ?? undefined) : undefined),
  });
}

export function useMyPayouts() {
  return useQuery({ queryKey: k.myPayouts, queryFn: () => api.get<PayoutResponse[]>("/provider/me/payouts") });
}

export function usePayoutAccount() {
  return useQuery({ queryKey: k.account, queryFn: () => api.get<PayoutAccountResponse | null>("/provider/me/payout-account") });
}

export function useSavePayoutAccount() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: PayoutAccountRequest) => api.put<PayoutAccountResponse>("/provider/me/payout-account", body),
    onSuccess: (account) => client.setQueryData(k.account, account),
  });
}

// --- Admin --------------------------------------------------------------------

export function useRefunds(status: RefundStatus) {
  return useQuery({
    queryKey: k.refunds(status),
    queryFn: () => api.get<PaginatedResponse<AdminRefundResponse>>("/admin/refunds", { status, limit: 50 }),
  });
}

export function useRefundActions() {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: ["admin", "refunds"] });
  return {
    markProcessed: useMutation({
      mutationFn: ({ id, gatewayRefundId }: { id: string; gatewayRefundId: string }) =>
        api.post<AdminRefundResponse>(`/admin/refunds/${id}/mark-processed`, { gatewayRefundId }),
      onSuccess: refresh,
    }),
    retry: useMutation({
      mutationFn: (id: string) => api.post<AdminRefundResponse>(`/admin/refunds/${id}/retry`),
      onSuccess: refresh,
    }),
  };
}

export function usePayoutsDue(until: string) {
  return useQuery({ queryKey: k.due(until), queryFn: () => api.get<PayoutDueResponse[]>("/admin/payouts/due", { until }) });
}

export function usePayouts(status: "PENDING" | "PAID" | "CANCELLED") {
  return useQuery({
    queryKey: k.payouts(status),
    queryFn: () => api.get<PaginatedResponse<PayoutResponse>>("/admin/payouts", { status, limit: 50 }),
  });
}

export function usePayoutActions() {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: ["admin", "payouts"] });
  return {
    create: useMutation({
      mutationFn: (body: { providerId: string; until: string }) => api.post<PayoutResponse>("/admin/payouts", body),
      onSuccess: refresh,
    }),
    account: useMutation({
      mutationFn: (id: string) => api.get<PayoutAccountResponse & { accountNumber: string }>(`/admin/payouts/${id}/account`),
    }),
    markPaid: useMutation({
      mutationFn: ({ id, reference }: { id: string; reference: string }) =>
        api.post<PayoutResponse>(`/admin/payouts/${id}/mark-paid`, { reference }),
      onSuccess: refresh,
    }),
    cancel: useMutation({
      mutationFn: (id: string) => api.post<PayoutResponse>(`/admin/payouts/${id}/cancel`),
      onSuccess: refresh,
    }),
  };
}
