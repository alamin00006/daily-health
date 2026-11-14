import { apiRequest, apiUpload, type UploadFile } from './http-client';
import { buildQuery } from './query-string';

import type {
  ConversationResponse,
  MessageResponse,
  SendMessageRequest,
} from '@/shared-contracts/chat.contract';
import type { PaginatedResponse } from '@/shared-contracts/common-fields.contract';
import type {
  CallJoinResponse,
  ConsultationResponse,
  QuickConsultOptionResponse,
  StartQuickConsultRequest,
} from '@/shared-contracts/consultation.contract';
import type { RealtimeTicketResponse } from '@/shared-contracts/realtime.contract';

const auth = { authenticated: true } as const;

/** Quick consults, consultations and their calls. */
export const consultationsEndpoints = {
  quickOptions: () => apiRequest<QuickConsultOptionResponse[]>('/quick-consults/options', auth),
  startQuick: (profileId: string, body: StartQuickConsultRequest) =>
    apiRequest<ConsultationResponse>(`/profiles/${profileId}/quick-consults`, {
      ...auth,
      method: 'POST',
      body,
    }),
  mine: (state: 'active' | 'past' | 'all', cursor?: string) =>
    apiRequest<PaginatedResponse<ConsultationResponse>>(
      `/me/consultations${buildQuery({ state, cursor, limit: 20 })}`,
      auth
    ),
  get: (consultationId: string) =>
    apiRequest<ConsultationResponse>(`/consultations/${consultationId}`, auth),
  cancel: (consultationId: string) =>
    apiRequest<ConsultationResponse>(`/consultations/${consultationId}/cancel`, {
      ...auth,
      method: 'POST',
    }),
  end: (consultationId: string) =>
    apiRequest<ConsultationResponse>(`/consultations/${consultationId}/end`, {
      ...auth,
      method: 'POST',
    }),
  joinCall: (consultationId: string) =>
    apiRequest<CallJoinResponse>(`/consultations/${consultationId}/call/join`, {
      ...auth,
      method: 'POST',
    }),
  declineCall: (consultationId: string) =>
    apiRequest<void>(`/consultations/${consultationId}/call/decline`, { ...auth, method: 'POST' }),
};

/** The consultation chat. */
export const chatEndpoints = {
  conversation: (conversationId: string) =>
    apiRequest<ConversationResponse>(`/conversations/${conversationId}`, auth),
  messages: (conversationId: string, cursor?: string) =>
    apiRequest<PaginatedResponse<MessageResponse>>(
      `/conversations/${conversationId}/messages${buildQuery({ cursor, limit: 30 })}`,
      auth
    ),
  send: (conversationId: string, body: SendMessageRequest) =>
    apiRequest<MessageResponse>(`/conversations/${conversationId}/messages`, {
      ...auth,
      method: 'POST',
      body,
    }),
  sendImage: (conversationId: string, file: UploadFile, clientMsgId: string) =>
    apiUpload<MessageResponse>(`/conversations/${conversationId}/images`, file, { clientMsgId }),
  markRead: (conversationId: string) =>
    apiRequest<void>(`/conversations/${conversationId}/read`, { ...auth, method: 'POST' }),
};

export const realtimeEndpoints = {
  /** One-time ticket for the Socket.io handshake. */
  ticket: () => apiRequest<RealtimeTicketResponse>('/realtime/ticket', { ...auth, method: 'POST' }),
};
