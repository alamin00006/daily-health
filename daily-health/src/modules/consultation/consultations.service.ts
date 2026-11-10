import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import {
  APPOINTMENT_CANCELLED_EVENT,
  type AppointmentEvent,
} from '../../common/events/booking-events.js';
import { emitAuditEvent } from '../../common/events/audit-event.js';
import { AppException } from '../../common/errors/app-exception.js';
import {
  afterCursor,
  toKeysetPage,
} from '../../common/pagination/keyset-cursor.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { RealtimeService } from '../../core/realtime/realtime.service.js';
import type {
  ConsultActor,
  Consultation,
  ConsultStatus,
  Prisma,
} from '../../generated/prisma/client.js';
import type { PaginatedResponse } from '../../shared-contracts/common-fields.contract.js';
import type {
  CallJoinResponse,
  ConsultationResponse,
  ListMyConsultationsQuery,
  ListProviderConsultationsQuery,
} from '../../shared-contracts/consultation.contract.js';
import {
  REALTIME_EVENTS,
  type CallAnsweredEvent,
  type CallRingingEvent,
  type ConsultationUpdatedEvent,
} from '../../shared-contracts/realtime.contract.js';
import { AppointmentLookupService } from '../appointments/appointment-lookup.service.js';
import { ChatService } from '../chat/chat.service.js';
import { ProviderDirectoryService } from '../doctors/provider-directory.service.js';
import {
  NotificationDeliveryService,
  type OutgoingNotification,
} from '../notifications/notification-delivery.service.js';
import { PatientProfilesService } from '../users/patient-profiles.service.js';
import { ConsultationErrorCode } from './consultation-error-codes.js';
import { ConsultationViewsService } from './consultation-views.service.js';
import { VideoProvider } from './video/video-provider.js';

/** Agora uids: one for the provider, one for the patient side. */
export const PROVIDER_RTC_UID = 1001;
export const PATIENT_RTC_UID = 2001;
/** A booked consult can be opened this long before its time… */
const OPEN_BEFORE_MS = 15 * 60_000;
/** …and until this long after its slot/session ends. */
const OPEN_AFTER_END_MS = 60 * 60_000;

export const CONSULTATION_ENDED_EVENT = 'consultation.ended';
export interface ConsultationEndedEvent {
  consultationId: string;
  appointmentId: string | null;
  patientId: string;
  providerId: string | null;
}

const ACTIVE: ConsultStatus[] = ['PENDING_PAYMENT', 'WAITING', 'ONGOING'];
const PAST: ConsultStatus[] = ['ENDED', 'MISSED', 'CANCELLED', 'EXPIRED'];

/**
 * Consultation sessions: booked VIDEO/CHAT appointments run here, and quick
 * consults (QuickConsultsService) end up here once a doctor takes them.
 * Every consultation has a chat; who is in that chat decides who may see the
 * consultation. Calls go through VideoProvider (Agora).
 */
@Injectable()
export class ConsultationsService {
  private readonly logger = new Logger(ConsultationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly views: ConsultationViewsService,
    private readonly chat: ChatService,
    private readonly directory: ProviderDirectoryService,
    private readonly appointments: AppointmentLookupService,
    private readonly profiles: PatientProfilesService,
    private readonly video: VideoProvider,
    private readonly realtime: RealtimeService,
    private readonly delivery: NotificationDeliveryService,
    private readonly events: EventEmitter2,
  ) {}

  // -------------------------------------------------------------------------
  // Reading
  // -------------------------------------------------------------------------

  async getForUser(userId: string, consultationId: string): Promise<ConsultationResponse> {
    const row = await this.requireParticipant(userId, consultationId);
    this.audit(userId, row, 'consultation.view');
    return this.views.one(row);
  }

  async listMine(
    userId: string,
    query: ListMyConsultationsQuery,
  ): Promise<PaginatedResponse<ConsultationResponse>> {
    const ids = await this.chat.consultationIdsOf(userId);
    const rows = await this.prisma.consultation.findMany({
      where: {
        OR: [{ requestedByUserId: userId }, { id: { in: ids } }],
        ...stateFilter(query.state),
        ...afterCursor('createdAt', query.cursor),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    const page = toKeysetPage(rows, query.limit, (row) => row.createdAt, (row) => row);
    return { data: await this.views.many(page.data), meta: page.meta };
  }

  async listForProvider(
    userId: string,
    query: ListProviderConsultationsQuery,
  ): Promise<PaginatedResponse<ConsultationResponse>> {
    const provider = await this.directory.requireOwn(userId);
    const rows = await this.prisma.consultation.findMany({
      where: {
        providerId: provider.id,
        ...stateFilter(query.state),
        ...afterCursor('createdAt', query.cursor),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    const page = toKeysetPage(rows, query.limit, (row) => row.createdAt, (row) => row);
    return { data: await this.views.many(page.data), meta: page.meta };
  }

  // -------------------------------------------------------------------------
  // Booked VIDEO / CHAT appointments
  // -------------------------------------------------------------------------

  /** The provider opens the consultation of a booking (idempotent). */
  async startBooked(userId: string, appointmentId: string): Promise<ConsultationResponse> {
    const provider = await this.directory.requireOwn(userId);
    const appointment = await this.appointments.findById(appointmentId);
    if (!appointment || appointment.providerId !== provider.id) throw notFound();
    if (appointment.mode !== 'VIDEO' && appointment.mode !== 'CHAT') {
      throw new AppException(
        ConsultationErrorCode.NOT_AN_ONLINE_APPOINTMENT,
        'Only video and chat bookings run as consultations',
        HttpStatus.CONFLICT,
      );
    }

    const existing = await this.prisma.consultation.findUnique({ where: { appointmentId } });
    if (existing) {
      if (existing.status !== 'ONGOING') throw statusConflict(existing.status);
      return this.views.one(existing);
    }

    const now = Date.now();
    if (
      appointment.status !== 'CONFIRMED' ||
      now < appointment.scheduledAt.getTime() - OPEN_BEFORE_MS ||
      now > appointment.sessionEndAt.getTime() + OPEN_AFTER_END_MS
    ) {
      throw new AppException(
        ConsultationErrorCode.OUTSIDE_CONSULT_WINDOW,
        'This booking can be started from 15 minutes before its time until an hour after it',
        HttpStatus.CONFLICT,
        { appointmentStatus: appointment.status, scheduledAt: appointment.scheduledAt.toISOString() },
      );
    }

    const row = await this.prisma.consultation
      .create({
        data: {
          appointmentId,
          patientId: appointment.patientId,
          requestedByUserId: appointment.bookedByUserId,
          providerId: provider.id,
          providerUserId: provider.userId,
          channel: appointment.mode === 'VIDEO' ? 'VIDEO' : 'CHAT',
          tier: 'STANDARD',
          status: 'ONGOING',
          fee: appointment.fee,
          startedAt: new Date(),
        },
      })
      .catch(async (error: unknown) => {
        // Opened at the same moment from another tab.
        const raced = await this.prisma.consultation.findUnique({ where: { appointmentId } });
        if (raced) return raced;
        throw error;
      });

    const patientSide = await this.patientSideUsers(appointment.patientId, appointment.bookedByUserId);
    const conversationId = await this.chat.ensureConversation({
      consultationId: row.id,
      patientId: row.patientId,
      participants: [
        { userId: provider.userId, role: 'PROVIDER' },
        ...patientSide.map((id) => ({ userId: id, role: 'PATIENT' as const })),
      ],
    });
    const doctor = providerTitle(provider);
    await this.chat.postSystem(conversationId, `${doctor} পরামর্শ শুরু করেছেন।`);
    this.audit(userId, row, 'consultation.start');
    await this.announce(row, {
      type: 'consultation.started',
      title: `${doctor} পরামর্শ শুরু করেছেন`,
      body: row.channel === 'VIDEO' ? 'ডাক্তার কল করলে অ্যাপে ধরুন।' : 'চ্যাট খুলে কথা বলুন।',
    });
    return this.views.one(row);
  }

  // -------------------------------------------------------------------------
  // Calls
  // -------------------------------------------------------------------------

  /**
   * Either side joins the call. The provider's join opens the call and rings
   * the patient side; the patient can join only while the provider is in it.
   */
  async joinCall(userId: string, consultationId: string): Promise<CallJoinResponse> {
    const row = await this.requireParticipant(userId, consultationId);
    if (row.channel === 'CHAT') {
      throw new AppException(ConsultationErrorCode.NOT_A_CALL, 'This consultation is chat only', HttpStatus.CONFLICT);
    }
    if (row.status !== 'ONGOING') throw statusConflict(row.status);
    if (!this.video.isConfigured) {
      throw new AppException(
        ConsultationErrorCode.VIDEO_NOT_CONFIGURED,
        'Video calls are not set up on this server',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    const isProvider = row.providerUserId === userId;

    if (!isProvider) {
      if (!row.callActive) {
        throw new AppException(
          ConsultationErrorCode.CALL_NOT_STARTED,
          'The doctor has not started the call yet',
          HttpStatus.CONFLICT,
        );
      }
      const token = this.video.issueToken(row.rtcChannel!, PATIENT_RTC_UID);
      if (row.providerUserId) {
        this.realtime.toUser(row.providerUserId, REALTIME_EVENTS.CALL_ANSWERED, {
          consultationId: row.id,
          answer: 'JOINED',
        } satisfies CallAnsweredEvent);
      }
      this.audit(userId, row, 'consultation.call.join');
      return toJoinResponse(token, PROVIDER_RTC_UID);
    }

    const channel = row.rtcChannel ?? this.video.createRoom(row.id).channel;
    const token = this.video.issueToken(channel, PROVIDER_RTC_UID);
    const updated = await this.prisma.consultation.update({
      where: { id: row.id },
      data: { rtcChannel: channel, callActive: true, ringingAt: new Date() },
    });
    await this.ring(updated);
    return toJoinResponse(token, PATIENT_RTC_UID);
  }

  /** The provider rings again (the patient missed it). */
  async ringAgain(userId: string, consultationId: string): Promise<ConsultationResponse> {
    const row = await this.requireProviderOf(userId, consultationId);
    if (row.status !== 'ONGOING' || !row.callActive) throw statusConflict(row.status);
    const updated = await this.prisma.consultation.update({
      where: { id: row.id },
      data: { ringingAt: new Date() },
    });
    await this.ring(updated);
    return this.views.one(updated);
  }

  async declineCall(userId: string, consultationId: string): Promise<void> {
    const row = await this.requireParticipant(userId, consultationId);
    if (row.providerUserId && row.providerUserId !== userId) {
      this.realtime.toUser(row.providerUserId, REALTIME_EVENTS.CALL_ANSWERED, {
        consultationId: row.id,
        answer: 'DECLINED',
      } satisfies CallAnsweredEvent);
    }
  }

  /** The provider hangs up; the consultation (and its chat) stays open until ended. */
  async leaveCall(userId: string, consultationId: string): Promise<ConsultationResponse> {
    const row = await this.requireParticipant(userId, consultationId);
    if (row.providerUserId !== userId) return this.views.one(row);
    const updated = await this.prisma.consultation.update({
      where: { id: row.id },
      data: { callActive: false },
    });
    await this.publish(updated);
    return this.views.one(updated);
  }

  // -------------------------------------------------------------------------
  // Ending
  // -------------------------------------------------------------------------

  /** The provider ends any ongoing consult; the patient side may end a quick one early. */
  async endByUser(userId: string, consultationId: string): Promise<ConsultationResponse> {
    const row = await this.requireParticipant(userId, consultationId);
    const isProvider = row.providerUserId === userId;
    if (!isProvider && row.tier !== 'QUICK') {
      throw new AppException(
        ConsultationErrorCode.CONSULTATION_STATUS_CONFLICT,
        'Only the doctor ends a booked consultation',
        HttpStatus.FORBIDDEN,
      );
    }
    if (row.status !== 'ONGOING') throw statusConflict(row.status);
    const ended = await this.finish(row, isProvider ? 'PROVIDER' : 'PATIENT');
    this.audit(userId, ended, 'consultation.end');
    return this.views.one(ended);
  }

  /**
   * ONGOING → ENDED: close the call and the chat, tell everyone. Returns the
   * row unchanged when someone else ended it first.
   */
  async finish(row: Consultation, by: ConsultActor): Promise<Consultation> {
    const endedAt = new Date();
    const result = await this.prisma.consultation.updateMany({
      where: { id: row.id, status: 'ONGOING' },
      data: {
        status: 'ENDED',
        endedAt,
        endedBy: by,
        callActive: false,
        durationSec: row.startedAt
          ? Math.max(0, Math.round((endedAt.getTime() - row.startedAt.getTime()) / 1000))
          : 0,
      },
    });
    const ended = await this.prisma.consultation.findUniqueOrThrow({ where: { id: row.id } });
    if (result.count === 0) return ended;

    if (ended.rtcChannel) await this.video.endRoom(ended.rtcChannel).catch(() => undefined);
    const conversation = (await this.chat.conversationIdsFor([ended.id])).get(ended.id);
    if (conversation) {
      await this.chat.postSystem(
        conversation.id,
        by === 'SYSTEM' ? 'সময় শেষ, পরামর্শ বন্ধ হয়েছে।' : 'পরামর্শ শেষ হয়েছে।',
      );
      await this.chat.close(conversation.id);
    }
    await this.publish(ended);
    this.events.emit(CONSULTATION_ENDED_EVENT, {
      consultationId: ended.id,
      appointmentId: ended.appointmentId,
      patientId: ended.patientId,
      providerId: ended.providerId,
    } satisfies ConsultationEndedEvent);
    return ended;
  }

  /** A cancelled booking ends its consultation if it was running. */
  @OnEvent(APPOINTMENT_CANCELLED_EVENT, { async: true, promisify: true })
  async onAppointmentCancelled(event: AppointmentEvent): Promise<void> {
    const row = await this.prisma.consultation.findUnique({
      where: { appointmentId: event.appointmentId },
    });
    if (row?.status === 'ONGOING') await this.finish(row, 'SYSTEM');
  }

  // -------------------------------------------------------------------------
  // Shared with QuickConsultsService
  // -------------------------------------------------------------------------

  /** Socket `consultation:updated` to everyone in it (and the requester). */
  async publish(row: Consultation): Promise<void> {
    const users = new Set((await this.chat.participantsOf(row.id)).map((p) => p.userId));
    users.add(row.requestedByUserId);
    if (row.providerUserId) users.add(row.providerUserId);
    this.realtime.toUsers(users, REALTIME_EVENTS.CONSULTATION_UPDATED, {
      consultationId: row.id,
      status: row.status,
    } satisfies ConsultationUpdatedEvent);
  }

  /** `publish` plus a push/in-app notification to the patient side. */
  async announce(
    row: Consultation,
    message: Pick<OutgoingNotification, 'type' | 'title' | 'body' | 'urgent'>,
  ): Promise<void> {
    await this.publish(row);
    const patientSide = (await this.chat.participantsOf(row.id))
      .filter((p) => p.role === 'PATIENT')
      .map((p) => p.userId);
    const recipients = patientSide.length > 0 ? patientSide : [row.requestedByUserId];
    await this.delivery
      .deliver(
        recipients.map((userId) => ({
          userId,
          patientId: row.patientId,
          ...message,
          data: { screen: 'consultation', consultationId: row.id },
          channels: ['PUSH', 'IN_APP'],
          // Women's health: no details in push text (CLAUDE.md §4).
          sensitive: row.quickKind === 'WOMENS_HEALTH',
        })),
      )
      .catch((error: Error) => this.logger.warn(`consultation notice failed: ${error.message}`));
  }

  /** The patient's own account and whoever booked: the patient side of the chat. */
  async patientSideUsers(patientId: string, requestedByUserId: string): Promise<string[]> {
    const profile = (await this.profiles.findManyByIds([patientId])).get(patientId);
    return [...new Set([requestedByUserId, ...(profile?.linkedUserId ? [profile.linkedUserId] : [])])];
  }

  audit(userId: string, row: Consultation, action: string): void {
    emitAuditEvent(this.events, {
      actorUserId: userId,
      patientId: row.patientId,
      action,
      entityType: 'Consultation',
      entityId: row.id,
    });
  }

  async requireParticipant(userId: string, consultationId: string): Promise<Consultation> {
    const row = await this.prisma.consultation.findUnique({ where: { id: consultationId } });
    if (!row) throw notFound();
    if (row.requestedByUserId === userId || row.providerUserId === userId) return row;
    const participants = await this.chat.participantsOf(row.id);
    if (participants.some((p) => p.userId === userId)) return row;
    throw notFound();
  }

  /** The consultation a booked VIDEO/CHAT visit ran as (prescriptions post into its chat). */
  async findByAppointment(appointmentId: string): Promise<Consultation | null> {
    return this.prisma.consultation.findUnique({ where: { appointmentId } });
  }

  async requireProviderOf(userId: string, consultationId: string): Promise<Consultation> {
    const row = await this.prisma.consultation.findUnique({ where: { id: consultationId } });
    if (!row || row.providerUserId !== userId) throw notFound();
    return row;
  }

  // -------------------------------------------------------------------------

  private async ring(row: Consultation): Promise<void> {
    const provider = row.providerId ? await this.directory.findById(row.providerId) : null;
    const callerName = provider ? providerTitle(provider) : 'ডাক্তার';
    const patientSide = (await this.chat.participantsOf(row.id))
      .filter((p) => p.role === 'PATIENT')
      .map((p) => p.userId);
    this.realtime.toUsers(patientSide, REALTIME_EVENTS.CALL_RINGING, {
      consultationId: row.id,
      callerName,
    } satisfies CallRingingEvent);
    await this.publish(row);
    await this.delivery
      .deliver(
        patientSide.map((userId) => ({
          userId,
          patientId: row.patientId,
          type: 'consultation.call',
          title: `${callerName} কল করছেন`,
          body: 'ভিডিও কল ধরতে চাপুন।',
          data: { screen: 'consultation', consultationId: row.id, incomingCall: '1' },
          channels: ['PUSH'],
          urgent: true,
        })),
      )
      .catch((error: Error) => this.logger.warn(`call push failed: ${error.message}`));
  }
}

export function providerTitle(provider: { type: string; displayName: string }): string {
  return `${provider.type === 'DOCTOR' ? 'ডা. ' : ''}${provider.displayName}`;
}

function stateFilter(state: 'active' | 'past' | 'all'): Prisma.ConsultationWhereInput {
  if (state === 'active') return { status: { in: ACTIVE } };
  if (state === 'past') return { status: { in: PAST } };
  return {};
}

function toJoinResponse(
  token: { appId: string; channel: string; token: string; uid: number; expiresAt: Date },
  remoteUid: number,
): CallJoinResponse {
  return {
    appId: token.appId,
    channel: token.channel,
    token: token.token,
    uid: token.uid,
    remoteUid,
    expiresAt: token.expiresAt.toISOString(),
  };
}

export function notFound(): AppException {
  return new AppException(
    ConsultationErrorCode.CONSULTATION_NOT_FOUND,
    'Consultation not found',
    HttpStatus.NOT_FOUND,
  );
}

export function statusConflict(status: ConsultStatus): AppException {
  return new AppException(
    ConsultationErrorCode.CONSULTATION_STATUS_CONFLICT,
    `Not possible while the consultation is ${status}`,
    HttpStatus.CONFLICT,
    { status },
  );
}
