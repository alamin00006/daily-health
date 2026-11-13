import type { MessageResponse } from './chat.contract.js';
import type { ConsultStatus } from './consultation.contract.js';

/**
 * Socket.io connection (path `/socket.io`, same host as the API).
 * 1. POST /api/v1/realtime/ticket (logged in) → a one-time ticket valid for 60 s.
 * 2. io(origin, { auth: { ticket } }) — get a new ticket for every (re)connect.
 * The server only pushes; clients send through REST, except `chat:typing`.
 */
export interface RealtimeTicketResponse {
  ticket: string;
  expiresAt: string;
}

export const REALTIME_EVENTS = {
  /** server → client: a new message in one of my conversations. */
  CHAT_MESSAGE: 'chat:message',
  /** both ways: someone is typing (client sends `{ conversationId }`). */
  CHAT_TYPING: 'chat:typing',
  /** server → client: the other side read up to a time. */
  CHAT_READ: 'chat:read',
  /** server → client: a consultation I take part in changed; refetch it. */
  CONSULTATION_UPDATED: 'consultation:updated',
  /** server → patient: the doctor is calling. */
  CALL_RINGING: 'call:ringing',
  /** server → provider: the patient declined or joined. */
  CALL_ANSWERED: 'call:answered',
  /** server → online providers: the quick consult queue changed; refetch it. */
  QUICK_QUEUE_CHANGED: 'quick-consult:queue',
  /** server → staff: a new SOS request; refetch the emergency queue. */
  EMERGENCY_NEW: 'emergency:new',
  /** server → staff and the family: an SOS request changed. */
  EMERGENCY_UPDATED: 'emergency:updated',
} as const;

export interface ChatMessageEvent {
  message: MessageResponse;
}

export interface ChatTypingEvent {
  conversationId: string;
  userId: string;
}

export interface ChatReadEvent {
  conversationId: string;
  userId: string;
  lastReadAt: string;
}

export interface ConsultationUpdatedEvent {
  consultationId: string;
  status: ConsultStatus;
}

export interface CallRingingEvent {
  consultationId: string;
  /** "ডা. ফারহানা ইসলাম" */
  callerName: string;
}

export interface CallAnsweredEvent {
  consultationId: string;
  answer: 'JOINED' | 'DECLINED';
}

export interface QuickQueueChangedEvent {
  waiting: number;
}
