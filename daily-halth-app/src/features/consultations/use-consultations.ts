import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';

import type { UploadFile } from '@/api/http-client';
import { chatEndpoints, consultationsEndpoints } from '@/api/consultations-endpoints';
import { queryKeys } from '@/api/query-keys';
import type { MessageResponse } from '@/shared-contracts/chat.contract';
import type { PaginatedResponse } from '@/shared-contracts/common-fields.contract';
import type {
  ConsultationResponse,
  StartQuickConsultRequest,
} from '@/shared-contracts/consultation.contract';

export function useQuickConsultOptions() {
  return useQuery({
    queryKey: queryKeys.quickConsultOptions,
    queryFn: consultationsEndpoints.quickOptions,
    // Who is online changes often.
    staleTime: 15_000,
  });
}

export function useStartQuickConsult(profileId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: StartQuickConsultRequest) => consultationsEndpoints.startQuick(profileId, body),
    onSuccess: (row) => {
      client.setQueryData(queryKeys.consultation(row.id), row);
      void client.invalidateQueries({ queryKey: ['consultations'] });
    },
  });
}

export function useMyConsultations(state: 'active' | 'past') {
  return useInfiniteQuery({
    queryKey: queryKeys.consultations(state),
    queryFn: ({ pageParam }) => consultationsEndpoints.mine(state, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.meta.hasMore ? (last.meta.cursor ?? undefined) : undefined),
  });
}

export function useConsultation(consultationId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.consultation(consultationId ?? ''),
    queryFn: () => consultationsEndpoints.get(consultationId!),
    enabled: Boolean(consultationId),
    // The socket refreshes it; this covers a dropped connection on a slow network.
    refetchInterval: (query) =>
      ['PENDING_PAYMENT', 'WAITING', 'ONGOING'].includes(query.state.data?.status ?? '') ? 20_000 : false,
  });
}

function useStore() {
  const client = useQueryClient();
  return (row: ConsultationResponse) => {
    client.setQueryData(queryKeys.consultation(row.id), row);
    void client.invalidateQueries({ queryKey: ['consultations'] });
  };
}

export function useCancelConsultation() {
  const store = useStore();
  return useMutation({ mutationFn: consultationsEndpoints.cancel, onSuccess: store });
}

export function useEndConsultation() {
  const store = useStore();
  return useMutation({ mutationFn: consultationsEndpoints.end, onSuccess: store });
}

// --- Chat ----------------------------------------------------------------------

export function useConversation(conversationId: string | null) {
  return useQuery({
    queryKey: queryKeys.conversation(conversationId ?? ''),
    queryFn: () => chatEndpoints.conversation(conversationId!),
    enabled: Boolean(conversationId),
  });
}

/** Newest first (the list renders inverted). */
export function useMessages(conversationId: string | null) {
  return useInfiniteQuery({
    queryKey: queryKeys.messages(conversationId ?? ''),
    queryFn: ({ pageParam }) => chatEndpoints.messages(conversationId!, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.meta.hasMore ? (last.meta.cursor ?? undefined) : undefined),
    enabled: Boolean(conversationId),
  });
}

type MessagesCache = { pages: PaginatedResponse<MessageResponse>[]; pageParams: unknown[] };

/** Puts a sent message at the top of the cached first page (until the refetch). */
function prependMessage(cache: MessagesCache | undefined, message: MessageResponse): MessagesCache | undefined {
  if (!cache || cache.pages.length === 0) return cache;
  const [first, ...rest] = cache.pages;
  if (first!.data.some((m) => m.id === message.id)) return cache;
  return { ...cache, pages: [{ ...first!, data: [message, ...first!.data] }, ...rest] };
}

export function useSendMessage(conversationId: string) {
  const client = useQueryClient();
  return useMutation({
    // Same clientMsgId on a retry: the API returns the first message instead of a duplicate.
    mutationFn: (input: { body: string; clientMsgId?: string }) =>
      chatEndpoints.send(conversationId, {
        body: input.body,
        clientMsgId: input.clientMsgId ?? Crypto.randomUUID(),
      }),
    onSuccess: (message) => {
      client.setQueryData<MessagesCache>(queryKeys.messages(conversationId), (cache) =>
        prependMessage(cache, message)
      );
    },
  });
}

export function useSendImage(conversationId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (file: UploadFile) => chatEndpoints.sendImage(conversationId, file, Crypto.randomUUID()),
    onSuccess: (message) => {
      client.setQueryData<MessagesCache>(queryKeys.messages(conversationId), (cache) =>
        prependMessage(cache, message)
      );
    },
  });
}

export function useMarkRead(conversationId: string | null) {
  return useMutation({ mutationFn: () => chatEndpoints.markRead(conversationId!) });
}
