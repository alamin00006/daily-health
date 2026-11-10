import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Redis } from 'ioredis';
import { emitAuditEvent } from '../../common/events/audit-event.js';
import { AppException } from '../../common/errors/app-exception.js';
import {
  afterCursor,
  toKeysetPage,
} from '../../common/pagination/keyset-cursor.js';
import { ColumnEncryptionService } from '../../core/crypto/column-encryption.service.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { RealtimeService } from '../../core/realtime/realtime.service.js';
import { REDIS_CLIENT } from '../../core/redis/redis.module.js';
import { StoredUploadsService } from '../../core/uploads/stored-uploads.service.js';
import { UploadedFileProcessorService } from '../../core/uploads/uploaded-file-processor.service.js';
import {
  Prisma,
  type ChatParticipantRole,
  type Conversation,
  type ConversationParticipant,
  type Message,
} from '../../generated/prisma/client.js';
import type {
  ChatRole,
  ConversationResponse,
  ListMessagesQuery,
  MessageResponse,
  SendImageFields,
  SendMessageRequest,
} from '../../shared-contracts/chat.contract.js';
import type { PaginatedResponse } from '../../shared-contracts/common-fields.contract.js';
import {
  REALTIME_EVENTS,
  type ChatMessageEvent,
  type ChatReadEvent,
  type ChatTypingEvent,
} from '../../shared-contracts/realtime.contract.js';
import { NotificationDeliveryService } from '../notifications/notification-delivery.service.js';
import { ChatErrorCode } from './chat-error-codes.js';

const BODY_CONTEXT = 'chat.Message.body';
const ATTACHMENT_CONTEXT = 'chat.Message.attachmentStorageKey';
/** At most one "new message" push per conversation and person in this window. */
const PUSH_COOLDOWN_SECONDS = 120;

type ConversationWithParticipants = Conversation & {
  participants: ConversationParticipant[];
};

export interface NewConversation {
  consultationId: string;
  patientId: string;
  participants: { userId: string; role: 'PATIENT' | 'PROVIDER' }[];
}

/**
 * Chat of a consultation. Only participants can read or write; the
 * consultation module decides who they are. Message bodies and attachment
 * keys are encrypted; images go through the upload pipeline into private
 * storage. New messages reach the other side over Socket.io, and as a push
 * without the text when they are not connected.
 */
@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: ColumnEncryptionService,
    private readonly uploadProcessor: UploadedFileProcessorService,
    private readonly uploads: StoredUploadsService,
    private readonly realtime: RealtimeService,
    private readonly delivery: NotificationDeliveryService,
    private readonly events: EventEmitter2,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  // -------------------------------------------------------------------------
  // For the consultation module
  // -------------------------------------------------------------------------

  /** The conversation of a consultation; created once (idempotent). */
  async ensureConversation(input: NewConversation): Promise<string> {
    const existing = await this.prisma.conversation.findUnique({
      where: { consultationId: input.consultationId },
      select: { id: true },
    });
    const conversationId =
      existing?.id ??
      (
        await this.prisma.conversation
          .create({
            data: {
              type: 'CONSULTATION',
              consultationId: input.consultationId,
              patientId: input.patientId,
            },
            select: { id: true },
          })
          .catch(async (error: unknown) => {
            // Created by a concurrent call.
            if (isUniqueViolation(error)) {
              return this.prisma.conversation.findUniqueOrThrow({
                where: { consultationId: input.consultationId },
                select: { id: true },
              });
            }
            throw error;
          })
      ).id;
    for (const participant of input.participants) {
      await this.addParticipant(conversationId, participant.userId, participant.role);
    }
    return conversationId;
  }

  async addParticipant(
    conversationId: string,
    userId: string,
    role: ChatParticipantRole,
  ): Promise<void> {
    await this.prisma.conversationParticipant.upsert({
      where: { conversationId_userId: { conversationId, userId } },
      create: { conversationId, userId, role },
      update: {},
    });
  }

  async conversationIdsFor(consultationIds: string[]): Promise<Map<string, Conversation>> {
    if (consultationIds.length === 0) return new Map();
    const rows = await this.prisma.conversation.findMany({
      where: { consultationId: { in: [...new Set(consultationIds)] } },
    });
    return new Map(rows.flatMap((row) => (row.consultationId ? [[row.consultationId, row] as const] : [])));
  }

  /** Everyone in a consultation's chat, by role. */
  async participantsOf(
    consultationId: string,
  ): Promise<{ userId: string; role: ChatRole }[]> {
    const rows = await this.prisma.conversationParticipant.findMany({
      where: { conversation: { consultationId } },
      select: { userId: true, role: true },
    });
    return rows.map((row) => ({ userId: row.userId, role: toChatRole(row.role) }));
  }

  /** Consultations whose chat this user is in (newest activity first). */
  async consultationIdsOf(userId: string): Promise<string[]> {
    const rows = await this.prisma.conversation.findMany({
      where: { consultationId: { not: null }, participants: { some: { userId } } },
      select: { consultationId: true },
    });
    return rows.flatMap((row) => (row.consultationId ? [row.consultationId] : []));
  }

  /** A message from someone, without the participant checks (the patient's opening question). */
  async postAs(
    conversationId: string,
    senderId: string,
    text: string,
  ): Promise<void> {
    const message = await this.prisma.message.create({
      data: {
        conversationId,
        senderId,
        type: 'TEXT',
        body: this.encryption.encrypt(text, BODY_CONTEXT),
      },
    });
    await this.touch(conversationId, message.createdAt);
  }

  /** A line from the system ("ডাক্তার যোগ দিয়েছেন"), pushed to everyone in the chat. */
  async postSystem(conversationId: string, text: string): Promise<void> {
    const message = await this.prisma.message.create({
      data: {
        conversationId,
        senderId: null,
        type: 'SYSTEM',
        body: this.encryption.encrypt(text, BODY_CONTEXT),
      },
    });
    await this.touch(conversationId, message.createdAt);
    const conversation = await this.requireConversation(conversationId);
    this.broadcast(conversation, message);
  }

  /**
   * A prescription card in a consultation's chat, from the doctor (works on a
   * closed chat too: a prescription is often written after the call).
   */
  async postPrescription(
    consultationId: string,
    senderId: string,
    text: string,
    prescriptionId: string,
  ): Promise<void> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { consultationId },
      include: { participants: true },
    });
    if (!conversation || !conversation.participants.some((p) => p.userId === senderId)) return;
    const message = await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderId,
        type: 'PRESCRIPTION',
        body: this.encryption.encrypt(text, BODY_CONTEXT),
        refId: prescriptionId,
      },
    });
    await this.touch(conversation.id, message.createdAt);
    this.broadcast(conversation, message);
  }

  /** Read only from now on. */
  async close(conversationId: string): Promise<void> {
    await this.prisma.conversation.updateMany({
      where: { id: conversationId, isOpen: true },
      data: { isOpen: false, closedAt: new Date() },
    });
  }

  // -------------------------------------------------------------------------
  // Participants
  // -------------------------------------------------------------------------

  async get(userId: string, conversationId: string): Promise<ConversationResponse> {
    const { conversation, me } = await this.requireParticipant(userId, conversationId);
    const unreadCount = await this.prisma.message.count({
      where: {
        conversationId,
        deletedAt: null,
        NOT: { senderId: userId },
        ...(me.lastReadAt ? { createdAt: { gt: me.lastReadAt } } : {}),
      },
    });
    return {
      id: conversation.id,
      consultationId: conversation.consultationId ?? '',
      isOpen: conversation.isOpen,
      myRole: toChatRole(me.role),
      participants: conversation.participants.map((p) => ({
        userId: p.userId,
        role: toChatRole(p.role),
        lastReadAt: p.lastReadAt?.toISOString() ?? null,
      })),
      unreadCount,
      lastMessageAt: conversation.lastMessageAt?.toISOString() ?? null,
      urlsExpireAt: this.uploads.privateUrlsExpireAt().toISOString(),
    };
  }

  /** Newest first. */
  async messages(
    userId: string,
    conversationId: string,
    query: ListMessagesQuery,
  ): Promise<PaginatedResponse<MessageResponse>> {
    const { conversation } = await this.requireParticipant(userId, conversationId);
    const rows = await this.prisma.message.findMany({
      where: {
        conversationId,
        deletedAt: null,
        ...afterCursor('createdAt', query.cursor),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    this.audit(userId, conversation, 'chat.messages.view');
    const roles = roleMap(conversation);
    return toKeysetPage(
      rows,
      query.limit,
      (row) => row.createdAt,
      (row) => this.toResponse(row, roles),
    );
  }

  async send(
    userId: string,
    conversationId: string,
    input: SendMessageRequest,
  ): Promise<MessageResponse> {
    const { conversation } = await this.requireWritable(userId, conversationId);
    const earlier = await this.findByClientId(conversationId, input.clientMsgId);
    if (earlier) return this.toResponse(earlier, roleMap(conversation));

    let message: Message;
    try {
      message = await this.prisma.message.create({
        data: {
          conversationId,
          senderId: userId,
          type: 'TEXT',
          body: this.encryption.encrypt(input.body, BODY_CONTEXT),
          clientMsgId: input.clientMsgId,
        },
      });
    } catch (error) {
      const raced = isUniqueViolation(error)
        ? await this.findByClientId(conversationId, input.clientMsgId)
        : null;
      if (raced) return this.toResponse(raced, roleMap(conversation));
      throw error;
    }
    return this.afterSend(userId, conversation, message);
  }

  async sendImage(
    userId: string,
    conversationId: string,
    file: Buffer,
    fields: SendImageFields,
  ): Promise<MessageResponse> {
    const { conversation } = await this.requireWritable(userId, conversationId);
    const earlier = await this.findByClientId(conversationId, fields.clientMsgId);
    if (earlier) return this.toResponse(earlier, roleMap(conversation));

    const processed = await this.uploadProcessor.process(file, { allowPdf: false });
    const storageKey = await this.uploads.store(processed, 'private');
    let message: Message;
    try {
      message = await this.prisma.message.create({
        data: {
          conversationId,
          senderId: userId,
          type: 'IMAGE',
          body: fields.caption ? this.encryption.encrypt(fields.caption, BODY_CONTEXT) : null,
          attachmentStorageKey: this.encryption.encrypt(storageKey, ATTACHMENT_CONTEXT),
          attachmentMimeType: processed.mimeType,
          clientMsgId: fields.clientMsgId,
        },
      });
    } catch (error) {
      await this.uploads.remove(storageKey, processed.mimeType);
      const raced = isUniqueViolation(error)
        ? await this.findByClientId(conversationId, fields.clientMsgId)
        : null;
      if (raced) return this.toResponse(raced, roleMap(conversation));
      throw error;
    }
    return this.afterSend(userId, conversation, message);
  }

  /** Everything up to now is read; the other side sees it. */
  async markRead(userId: string, conversationId: string): Promise<void> {
    const { conversation } = await this.requireParticipant(userId, conversationId);
    const lastReadAt = new Date();
    await this.prisma.conversationParticipant.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { lastReadAt },
    });
    this.realtime.toUsers(
      others(conversation, userId),
      REALTIME_EVENTS.CHAT_READ,
      { conversationId, userId, lastReadAt: lastReadAt.toISOString() } satisfies ChatReadEvent,
    );
  }

  /** Socket `chat:typing` from a client; ignored unless it is a participant of an open chat. */
  async typing(userId: string, conversationId: string): Promise<void> {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, isOpen: true, participants: { some: { userId } } },
      include: { participants: true },
    });
    if (!conversation) return;
    this.realtime.toUsers(
      others(conversation, userId),
      REALTIME_EVENTS.CHAT_TYPING,
      { conversationId, userId } satisfies ChatTypingEvent,
    );
  }

  // -------------------------------------------------------------------------

  private async afterSend(
    userId: string,
    conversation: ConversationWithParticipants,
    message: Message,
  ): Promise<MessageResponse> {
    await this.touch(conversation.id, message.createdAt);
    await this.prisma.conversationParticipant.update({
      where: { conversationId_userId: { conversationId: conversation.id, userId } },
      data: { lastReadAt: message.createdAt },
    });
    const response = this.broadcast(conversation, message);
    await this.pushToAbsent(conversation, userId).catch((error: Error) =>
      this.logger.warn(`chat push failed: ${error.message}`),
    );
    return response;
  }

  private broadcast(
    conversation: ConversationWithParticipants,
    message: Message,
  ): MessageResponse {
    const response = this.toResponse(message, roleMap(conversation));
    this.realtime.toUsers(
      conversation.participants.map((p) => p.userId),
      REALTIME_EVENTS.CHAT_MESSAGE,
      { message: response } satisfies ChatMessageEvent,
    );
    return response;
  }

  /** "New message" push (never the text) to participants without an open socket. */
  private async pushToAbsent(
    conversation: ConversationWithParticipants,
    senderId: string,
  ): Promise<void> {
    const sender = conversation.participants.find((p) => p.userId === senderId);
    const absent = conversation.participants.filter(
      (p) => p.userId !== senderId && !p.muted && !this.realtime.isConnected(p.userId),
    );
    const recipients: string[] = [];
    for (const participant of absent) {
      const fresh = await this.redis.set(
        `chat:push:${conversation.id}:${participant.userId}`,
        '1',
        'EX',
        PUSH_COOLDOWN_SECONDS,
        'NX',
      );
      if (fresh) recipients.push(participant.userId);
    }
    if (recipients.length === 0) return;
    await this.delivery.deliver(
      recipients.map((userId) => ({
        userId,
        patientId: conversation.patientId,
        type: 'chat.message',
        title: sender?.role === 'PROVIDER' ? 'ডাক্তারের নতুন বার্তা' : 'রোগীর নতুন বার্তা',
        body: 'চ্যাট খুলে দেখুন।',
        data: {
          screen: 'consultation',
          consultationId: conversation.consultationId ?? '',
        },
        channels: ['PUSH'],
        sensitive: true,
      })),
    );
  }

  private async touch(conversationId: string, at: Date): Promise<void> {
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: at },
    });
  }

  private findByClientId(conversationId: string, clientMsgId: string): Promise<Message | null> {
    return this.prisma.message.findUnique({
      where: { conversationId_clientMsgId: { conversationId, clientMsgId } },
    });
  }

  private async requireConversation(conversationId: string): Promise<ConversationWithParticipants> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { participants: true },
    });
    if (!conversation) throw notFound();
    return conversation;
  }

  private async requireParticipant(
    userId: string,
    conversationId: string,
  ): Promise<{ conversation: ConversationWithParticipants; me: ConversationParticipant }> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { participants: true },
    });
    const me = conversation?.participants.find((p) => p.userId === userId);
    if (!conversation || !me) throw notFound();
    return { conversation, me };
  }

  private async requireWritable(userId: string, conversationId: string) {
    const found = await this.requireParticipant(userId, conversationId);
    if (!found.conversation.isOpen) {
      throw new AppException(
        ChatErrorCode.CONVERSATION_CLOSED,
        'This consultation has ended; the chat is read only',
        HttpStatus.CONFLICT,
      );
    }
    return found;
  }

  private audit(userId: string, conversation: Conversation, action: string): void {
    if (!conversation.patientId) return;
    emitAuditEvent(this.events, {
      actorUserId: userId,
      patientId: conversation.patientId,
      action,
      entityType: 'Conversation',
      entityId: conversation.id,
    });
  }

  private toResponse(row: Message, roles: Map<string, ChatRole>): MessageResponse {
    const storageKey = row.attachmentStorageKey
      ? this.encryption.decrypt(row.attachmentStorageKey, ATTACHMENT_CONTEXT)
      : null;
    const urls = storageKey && row.attachmentMimeType
      ? this.uploads.urls(storageKey, row.attachmentMimeType)
      : null;
    return {
      id: row.id,
      conversationId: row.conversationId,
      senderId: row.senderId,
      senderRole: row.senderId ? (roles.get(row.senderId) ?? 'PATIENT') : 'SYSTEM',
      type:
        row.type === 'IMAGE' || row.type === 'SYSTEM' || row.type === 'PRESCRIPTION'
          ? row.type
          : 'TEXT',
      body: row.body ? this.encryption.decrypt(row.body, BODY_CONTEXT) : null,
      attachment:
        urls && row.attachmentMimeType
          ? {
              mimeType: row.attachmentMimeType,
              url: urls.url,
              thumbnailUrl: urls.thumbnailUrl,
              previewUrl: urls.previewUrl,
            }
          : null,
      refId: row.refId,
      clientMsgId: row.clientMsgId,
      createdAt: row.createdAt.toISOString(),
    };
  }
}

function toChatRole(role: ChatParticipantRole): ChatRole {
  return role === 'PROVIDER' ? 'PROVIDER' : 'PATIENT';
}

function roleMap(conversation: ConversationWithParticipants): Map<string, ChatRole> {
  return new Map(conversation.participants.map((p) => [p.userId, toChatRole(p.role)]));
}

function others(conversation: ConversationWithParticipants, userId: string): string[] {
  return conversation.participants.filter((p) => p.userId !== userId).map((p) => p.userId);
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function notFound(): AppException {
  return new AppException(
    ChatErrorCode.CONVERSATION_NOT_FOUND,
    'Conversation not found',
    HttpStatus.NOT_FOUND,
  );
}
