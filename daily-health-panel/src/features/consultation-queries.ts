"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type {
  ConversationResponse,
  MessageResponse,
} from "@/shared-contracts/chat.contract";
import type { PaginatedResponse } from "@/shared-contracts/common-fields.contract";
import type {
  CallJoinResponse,
  ConsultationResponse,
  QuickConsultKind,
  QuickConsultQueueItemResponse,
  QuickConsultSettingChangeResponse,
  QuickConsultSettingResponse,
  UpdateQuickConsultSettingRequest,
} from "@/shared-contracts/consultation.contract";

export const consultKeys = {
  list: (state: string) => ["consultations", state] as const,
  one: (id: string) => ["consultation", id] as const,
  queue: ["quick-queue"] as const,
  conversation: (id: string) => ["chat", id, "conversation"] as const,
  messages: (id: string) => ["chat", id, "messages"] as const,
  settings: ["admin", "quick-consult-settings"] as const,
  history: ["admin", "quick-consult-settings", "history"] as const,
};

// --- Provider -----------------------------------------------------------------

export function useProviderConsultations(state: "active" | "past") {
  return useInfiniteQuery({
    queryKey: consultKeys.list(state),
    queryFn: ({ pageParam }) =>
      api.get<PaginatedResponse<ConsultationResponse>>("/provider/me/consultations", { state, cursor: pageParam, limit: 20 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.meta.hasMore ? (last.meta.cursor ?? undefined) : undefined),
  });
}

export function useConsultation(id: string) {
  return useQuery({ queryKey: consultKeys.one(id), queryFn: () => api.get<ConsultationResponse>(`/consultations/${id}`) });
}

export function useQuickQueue(enabled: boolean) {
  return useQuery({
    queryKey: consultKeys.queue,
    queryFn: () => api.get<QuickConsultQueueItemResponse[]>("/provider/me/quick-consults/queue"),
    enabled,
    // The socket refreshes it; this is the fallback when the socket is down.
    refetchInterval: 30_000,
  });
}

function useConsultationRefresh() {
  const client = useQueryClient();
  return (row: ConsultationResponse) => {
    client.setQueryData(consultKeys.one(row.id), row);
    void client.invalidateQueries({ queryKey: ["consultations"] });
  };
}

export function useAcceptQuickConsult() {
  const client = useQueryClient();
  const refresh = useConsultationRefresh();
  return useMutation({
    mutationFn: (id: string) => api.post<ConsultationResponse>(`/provider/me/quick-consults/${id}/accept`),
    onSuccess: refresh,
    onSettled: () => client.invalidateQueries({ queryKey: consultKeys.queue }),
  });
}

export function useStartBookedConsult() {
  const refresh = useConsultationRefresh();
  return useMutation({
    mutationFn: (appointmentId: string) => api.post<ConsultationResponse>("/provider/me/consultations", { appointmentId }),
    onSuccess: refresh,
  });
}

export function useEndConsultation() {
  const refresh = useConsultationRefresh();
  return useMutation({
    mutationFn: (id: string) => api.post<ConsultationResponse>(`/consultations/${id}/end`),
    onSuccess: refresh,
  });
}

export function useCallActions(id: string) {
  const refresh = useConsultationRefresh();
  const client = useQueryClient();
  return {
    join: useMutation({
      mutationFn: () => api.post<CallJoinResponse>(`/consultations/${id}/call/join`),
      onSuccess: () => client.invalidateQueries({ queryKey: consultKeys.one(id) }),
    }),
    leave: useMutation({
      mutationFn: () => api.post<ConsultationResponse>(`/consultations/${id}/call/leave`),
      onSuccess: refresh,
    }),
    ring: useMutation({
      mutationFn: () => api.post<ConsultationResponse>(`/provider/me/consultations/${id}/ring`),
      onSuccess: refresh,
    }),
  };
}

// --- Chat ----------------------------------------------------------------------

export function useConversation(id: string | null) {
  return useQuery({
    queryKey: consultKeys.conversation(id ?? ""),
    queryFn: () => api.get<ConversationResponse>(`/conversations/${id}`),
    enabled: Boolean(id),
  });
}

/** Newest first, page by page (the view shows them oldest at the top). */
export function useMessages(id: string | null) {
  return useInfiniteQuery({
    queryKey: consultKeys.messages(id ?? ""),
    queryFn: ({ pageParam }) =>
      api.get<PaginatedResponse<MessageResponse>>(`/conversations/${id}/messages`, { cursor: pageParam, limit: 30 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.meta.hasMore ? (last.meta.cursor ?? undefined) : undefined),
    enabled: Boolean(id),
  });
}

export function useSendMessage(conversationId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { clientMsgId: string; body: string }) =>
      api.post<MessageResponse>(`/conversations/${conversationId}/messages`, input),
    onSuccess: () => client.invalidateQueries({ queryKey: ["chat", conversationId] }),
  });
}

export function useSendImage(conversationId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { file: File; clientMsgId: string }) =>
      api.upload<MessageResponse>(`/conversations/${conversationId}/images`, input.file, { clientMsgId: input.clientMsgId }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["chat", conversationId] }),
  });
}

export function useMarkRead(conversationId: string) {
  return useMutation({ mutationFn: () => api.post<void>(`/conversations/${conversationId}/read`) });
}

// --- Admin ---------------------------------------------------------------------

export function useQuickConsultSettings() {
  return useQuery({ queryKey: consultKeys.settings, queryFn: () => api.get<QuickConsultSettingResponse[]>("/admin/quick-consult-settings") });
}

export function useQuickConsultHistory() {
  return useQuery({
    queryKey: consultKeys.history,
    queryFn: () => api.get<PaginatedResponse<QuickConsultSettingChangeResponse>>("/admin/quick-consult-settings/history", { limit: 30 }),
  });
}

export function useUpdateQuickConsultSetting() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ kind, body }: { kind: QuickConsultKind; body: UpdateQuickConsultSettingRequest }) =>
      api.put<QuickConsultSettingResponse>(`/admin/quick-consult-settings/${kind}`, body),
    onSuccess: () => client.invalidateQueries({ queryKey: consultKeys.settings }),
  });
}
