import { HttpStatus, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import {
  PAYMENT_PROVIDER_ASSIGNED_EVENT,
  PAYMENT_REFUND_REQUESTED_EVENT,
  PAYMENT_SUCCEEDED_EVENT,
  type PaymentProviderAssignedEvent,
  type PaymentRefundRequestedEvent,
  type PaymentSucceededEvent,
} from '../../common/events/booking-events.js';
import { AppException } from '../../common/errors/app-exception.js';
import { toBanglaDigits } from '../../common/formatting/bangla-digits.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { RealtimeService } from '../../core/realtime/realtime.service.js';
import {
  Prisma,
  type Consultation,
  type QuickConsultKind,
} from '../../generated/prisma/client.js';
import type {
  ConsultationResponse,
  QuickConsultQueueItemResponse,
  StartQuickConsultRequest,
} from '../../shared-contracts/consultation.contract.js';
import {
  REALTIME_EVENTS,
  type QuickQueueChangedEvent,
} from '../../shared-contracts/realtime.contract.js';
import { ChatService } from '../chat/chat.service.js';
import { ProviderDirectoryService } from '../doctors/provider-directory.service.js';
import {
  PayableRegistryService,
  type PayableItem,
} from '../payments/payable-registry.service.js';
import { PaymentsErrorCode } from '../payments/payments-error-codes.js';
import {
  ProfileAccessService,
  ProfileAction,
  type ProfileAccess,
} from '../users/profile-access.service.js';
import { ConsultationErrorCode } from './consultation-error-codes.js';
import { ConsultationViewsService } from './consultation-views.service.js';
import {
  ConsultationsService,
  notFound,
  providerTitle,
  statusConflict,
} from './consultations.service.js';
import {
  QuickConsultSettingsService,
  requiredGenderFor,
} from './quick-consult-settings.service.js';

/** Time to pay after starting a quick consult. */
const PAYMENT_HOLD_MS = 15 * 60_000;
/** The gateway page must not open with only seconds of the hold left. */
const MIN_HOLD_LEFT_MS = 60_000;

const KIND_TEXT: Record<QuickConsultKind, string> = {
  GENERAL: 'দ্রুত পরামর্শ (চ্যাট)',
  WOMENS_HEALTH: 'নারীস্বাস্থ্য দ্রুত পরামর্শ (চ্যাট)',
};

/**
 * Pay-and-wait chat consults (the "৳10 consult", price set by admins):
 * PENDING_PAYMENT → (paid) WAITING in the queue → a doctor accepts → ONGOING
 * for `sessionMin` → ENDED. Unpaid ones expire; ones no doctor takes within
 * `maxWaitMin` become MISSED and are refunded in full. Women's health ones
 * are offered to female doctors only, and their notifications carry no details.
 */
@Injectable()
export class QuickConsultsService implements OnModuleInit {
  private readonly logger = new Logger(QuickConsultsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: QuickConsultSettingsService,
    private readonly consultations: ConsultationsService,
    private readonly views: ConsultationViewsService,
    private readonly chat: ChatService,
    private readonly directory: ProviderDirectoryService,
    private readonly access: ProfileAccessService,
    private readonly registry: PayableRegistryService,
    private readonly realtime: RealtimeService,
    private readonly events: EventEmitter2,
  ) {}

  onModuleInit(): void {
    this.registry.register('QUICK_CONSULT', (userId, referenceId) =>
      this.payable(userId, referenceId),
    );
  }

  // -------------------------------------------------------------------------
  // Patient side
  // -------------------------------------------------------------------------

  async start(
    userId: string,
    profileId: string,
    input: StartQuickConsultRequest,
  ): Promise<ConsultationResponse> {
    // Women's health: only the patient themself (or the OWNER of a profile without an account).
    const access: ProfileAccess = await this.access.assert(
      userId,
      profileId,
      input.kind === 'WOMENS_HEALTH' ? ProfileAction.VIEW_WOMENS_HEALTH : ProfileAction.EDIT,
    );
    const setting = await this.settings.require(input.kind);
    if (!setting.isEnabled) {
      throw new AppException(
        ConsultationErrorCode.QUICK_CONSULT_DISABLED,
        'This quick consult is turned off for now',
        HttpStatus.CONFLICT,
      );
    }
    const online = await this.directory.onlineQuickConsultProviders(requiredGenderFor(input.kind));
    if (online.length === 0) {
      throw new AppException(
        ConsultationErrorCode.NO_DOCTOR_ONLINE,
        'No doctor is online for this right now',
        HttpStatus.CONFLICT,
      );
    }

    let row: Consultation;
    try {
      row = await this.prisma.consultation.create({
        data: {
          patientId: access.profile.id,
          requestedByUserId: userId,
          channel: 'CHAT',
          tier: 'QUICK',
          quickKind: input.kind,
          status: 'PENDING_PAYMENT',
          fee: setting.price,
          holdExpiresAt: new Date(Date.now() + PAYMENT_HOLD_MS),
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const live = await this.prisma.consultation.findFirst({
          where: {
            patientId: access.profile.id,
            tier: 'QUICK',
            status: { in: ['PENDING_PAYMENT', 'WAITING', 'ONGOING'] },
          },
          select: { id: true },
        });
        throw new AppException(
          ConsultationErrorCode.QUICK_CONSULT_ALREADY_ACTIVE,
          'This patient already has a quick consult in progress',
          HttpStatus.CONFLICT,
          { consultationId: live?.id ?? null },
        );
      }
      throw error;
    }

    const conversationId = await this.chat.ensureConversation({
      consultationId: row.id,
      patientId: row.patientId,
      participants: [{ userId, role: 'PATIENT' }],
    });
    await this.chat.postAs(conversationId, userId, input.concern);
    this.consultations.audit(userId, row, 'consultation.quick.start');
    return this.views.one(row);
  }

  /** The patient side cancels before a doctor took it; a paid one is refunded in full. */
  async cancel(userId: string, consultationId: string): Promise<ConsultationResponse> {
    const row = await this.consultations.requireParticipant(userId, consultationId);
    if (row.tier !== 'QUICK' || row.providerUserId === userId) throw notFound();
    if (row.status !== 'PENDING_PAYMENT' && row.status !== 'WAITING') {
      throw statusConflict(row.status);
    }
    const changed = await this.prisma.consultation.updateMany({
      where: { id: row.id, status: row.status },
      data: { status: 'CANCELLED', endedAt: new Date(), endedBy: 'PATIENT', waitingUntil: null },
    });
    if (changed.count === 0) {
      return this.views.one(await this.prisma.consultation.findUniqueOrThrow({ where: { id: row.id } }));
    }
    await this.prisma.consultQueueEntry.updateMany({
      where: { consultationId: row.id, status: 'WAITING' },
      data: { status: 'CANCELLED' },
    });
    if (row.status === 'WAITING') {
      await this.requestRefund(row.id, 'রোগী অপেক্ষার সময় বাতিল করেছেন');
      await this.queueChanged(row.quickKind);
    }
    await this.closeChat(row.id, 'পরামর্শ বাতিল করা হয়েছে।');
    const cancelled = await this.prisma.consultation.findUniqueOrThrow({ where: { id: row.id } });
    await this.consultations.publish(cancelled);
    this.consultations.audit(userId, cancelled, 'consultation.quick.cancel');
    return this.views.one(cancelled);
  }

  private async payable(userId: string, consultationId: string): Promise<PayableItem> {
    const row = await this.prisma.consultation.findUnique({ where: { id: consultationId } });
    if (!row || row.tier !== 'QUICK' || row.requestedByUserId !== userId) throw notFound();
    const holdLeft = (row.holdExpiresAt?.getTime() ?? 0) - Date.now();
    if (row.status !== 'PENDING_PAYMENT' || holdLeft < MIN_HOLD_LEFT_MS) {
      throw new AppException(
        PaymentsErrorCode.PAYMENT_NOT_ALLOWED,
        'This consult is not waiting for payment',
        HttpStatus.CONFLICT,
        { status: row.status, holdExpired: holdLeft < MIN_HOLD_LEFT_MS },
      );
    }
    const { profile } = await this.access.assert(
      userId,
      row.patientId,
      row.quickKind === 'WOMENS_HEALTH' ? ProfileAction.VIEW_WOMENS_HEALTH : ProfileAction.EDIT,
    );
    return {
      patientId: row.patientId,
      // Unknown until a doctor accepts (credited then, PAYMENT_PROVIDER_ASSIGNED_EVENT).
      providerId: null,
      amount: row.fee.toNumber(),
      description: KIND_TEXT[row.quickKind ?? 'GENERAL'],
      city: profile.district,
      payerName: profile.fullName,
    };
  }

  /** Paid → into the queue (also when the hold had just expired). A cancelled one is refunded. */
  @OnEvent(PAYMENT_SUCCEEDED_EVENT, { async: true, promisify: true })
  async onPaymentSucceeded(event: PaymentSucceededEvent): Promise<void> {
    if (event.purpose !== 'QUICK_CONSULT') return;
    const row = await this.prisma.consultation.findUnique({ where: { id: event.referenceId } });
    if (!row) return;
    if (row.status !== 'PENDING_PAYMENT' && row.status !== 'EXPIRED') {
      if (row.status === 'CANCELLED') {
        await this.requestRefund(row.id, 'পেমেন্টের আগেই পরামর্শ বাতিল করা হয়েছিল');
      }
      return;
    }
    const setting = await this.settings.require(row.quickKind ?? 'GENERAL');
    const waitingUntil = new Date(Date.now() + setting.maxWaitMin * 60_000);
    try {
      const moved = await this.prisma.$transaction(async (tx) => {
        const changed = await tx.consultation.updateMany({
          where: { id: row.id, status: row.status },
          data: { status: 'WAITING', waitingUntil, holdExpiresAt: null },
        });
        if (changed.count === 0) return false;
        await tx.consultQueueEntry.create({
          data: {
            consultationId: row.id,
            requiredProviderGender: requiredGenderFor(row.quickKind ?? 'GENERAL'),
          },
        });
        return true;
      });
      if (!moved) return;
    } catch (error) {
      // Paid late while another quick consult of this patient is live.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        await this.requestRefund(row.id, 'একই রোগীর আরেকটি পরামর্শ চলছিল');
        return;
      }
      throw error;
    }
    const waiting = await this.prisma.consultation.findUniqueOrThrow({ where: { id: row.id } });
    await this.consultations.publish(waiting);
    await this.queueChanged(row.quickKind);
  }

  // -------------------------------------------------------------------------
  // Provider side
  // -------------------------------------------------------------------------

  /** Waiting quick consults this provider may take, oldest first. */
  async queue(userId: string): Promise<QuickConsultQueueItemResponse[]> {
    const provider = await this.directory.requireOwn(userId);
    if (provider.verificationStatus !== 'VERIFIED' || !provider.acceptsQuickConsult) return [];
    const rows = await this.prisma.consultation.findMany({
      where: {
        tier: 'QUICK',
        status: 'WAITING',
        queueEntry: {
          status: 'WAITING',
          OR: [{ requiredProviderGender: null }, { requiredProviderGender: provider.gender }],
        },
      },
      include: { queueEntry: true },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });
    return this.views.queueItems(rows);
  }

  /** First doctor to accept gets it; the chat opens for `sessionMin`. */
  async accept(userId: string, consultationId: string): Promise<ConsultationResponse> {
    const provider = await this.directory.requireOwn(userId);
    const row = await this.prisma.consultation.findUnique({
      where: { id: consultationId },
      include: { queueEntry: true },
    });
    if (!row || row.tier !== 'QUICK') throw notFound();
    const genderOk =
      !row.queueEntry?.requiredProviderGender ||
      row.queueEntry.requiredProviderGender === provider.gender;
    if (
      provider.verificationStatus !== 'VERIFIED' ||
      !provider.acceptsQuickConsult ||
      !provider.isOnline ||
      !genderOk
    ) {
      throw new AppException(
        ConsultationErrorCode.QUICK_CONSULT_NOT_ELIGIBLE,
        'Go online with quick consults turned on (women’s health: female doctors only)',
        HttpStatus.FORBIDDEN,
      );
    }
    const setting = await this.settings.require(row.quickKind ?? 'GENERAL');
    const now = new Date();
    const taken = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.consultation.updateMany({
        where: { id: row.id, status: 'WAITING' },
        data: {
          status: 'ONGOING',
          providerId: provider.id,
          providerUserId: provider.userId,
          startedAt: now,
          endsAt: new Date(now.getTime() + setting.sessionMin * 60_000),
          waitingUntil: null,
        },
      });
      if (changed.count === 0) return false;
      await tx.consultQueueEntry.updateMany({
        where: { consultationId: row.id },
        data: { status: 'ASSIGNED', assignedAt: now },
      });
      return true;
    });
    if (!taken) {
      throw new AppException(
        ConsultationErrorCode.QUICK_CONSULT_TAKEN,
        'Another doctor took this consult, or it is no longer waiting',
        HttpStatus.CONFLICT,
      );
    }

    const ongoing = await this.prisma.consultation.findUniqueOrThrow({ where: { id: row.id } });
    const conversationId = await this.chat.ensureConversation({
      consultationId: row.id,
      patientId: row.patientId,
      participants: [{ userId: provider.userId, role: 'PROVIDER' }],
    });
    const doctor = providerTitle(provider);
    await this.chat.postSystem(
      conversationId,
      `${doctor} যোগ দিয়েছেন। ${toBanglaDigits(setting.sessionMin)} মিনিট কথা বলা যাবে।`,
    );
    this.events.emit(PAYMENT_PROVIDER_ASSIGNED_EVENT, {
      purpose: 'QUICK_CONSULT',
      referenceId: row.id,
      providerId: provider.id,
    } satisfies PaymentProviderAssignedEvent);
    this.consultations.audit(userId, ongoing, 'consultation.quick.accept');
    await this.consultations.announce(ongoing, {
      type: 'consultation.started',
      title: `${doctor} যোগ দিয়েছেন`,
      body: 'চ্যাট খুলে কথা বলুন।',
    });
    await this.queueChanged(row.quickKind);
    return this.views.one(ongoing);
  }

  // -------------------------------------------------------------------------
  // Timers (ConsultationTimersProcessor, every 30 s)
  // -------------------------------------------------------------------------

  /** Unpaid holds → EXPIRED; unanswered waits → MISSED + refund; over-time chats → ENDED. */
  async sweep(): Promise<{ expired: number; missed: number; ended: number }> {
    const now = new Date();
    const expired = await this.prisma.consultation.findMany({
      where: { tier: 'QUICK', status: 'PENDING_PAYMENT', holdExpiresAt: { lte: now } },
      take: 100,
    });
    for (const row of expired) {
      const changed = await this.prisma.consultation.updateMany({
        where: { id: row.id, status: 'PENDING_PAYMENT' },
        data: { status: 'EXPIRED', endedAt: now, endedBy: 'SYSTEM' },
      });
      if (changed.count === 0) continue;
      await this.closeChat(row.id, null);
      await this.consultations.publish({ ...row, status: 'EXPIRED' });
    }

    const missed = await this.prisma.consultation.findMany({
      where: { tier: 'QUICK', status: 'WAITING', waitingUntil: { lte: now } },
      take: 100,
    });
    for (const row of missed) {
      const changed = await this.prisma.consultation.updateMany({
        where: { id: row.id, status: 'WAITING' },
        data: { status: 'MISSED', endedAt: now, endedBy: 'SYSTEM', waitingUntil: null },
      });
      if (changed.count === 0) continue;
      await this.prisma.consultQueueEntry.updateMany({
        where: { consultationId: row.id, status: 'WAITING' },
        data: { status: 'EXPIRED' },
      });
      await this.requestRefund(row.id, 'সময়ের মধ্যে কোনো ডাক্তার পাওয়া যায়নি');
      await this.closeChat(row.id, 'এখন কোনো ডাক্তার পাওয়া যায়নি। পুরো টাকা ফেরত দেওয়া হচ্ছে।');
      await this.consultations.announce(
        { ...row, status: 'MISSED' },
        {
          type: 'consultation.missed',
          title: 'ডাক্তার পাওয়া যায়নি',
          body: 'পুরো টাকা ফেরত দেওয়া হচ্ছে। একটু পরে আবার চেষ্টা করুন।',
        },
      );
      await this.queueChanged(row.quickKind);
    }

    const overTime = await this.prisma.consultation.findMany({
      where: { tier: 'QUICK', status: 'ONGOING', endsAt: { lte: now } },
      take: 100,
    });
    for (const row of overTime) await this.consultations.finish(row, 'SYSTEM');

    return { expired: expired.length, missed: missed.length, ended: overTime.length };
  }

  // -------------------------------------------------------------------------

  private async requestRefund(consultationId: string, reason: string): Promise<void> {
    await this.events.emitAsync(PAYMENT_REFUND_REQUESTED_EVENT, {
      purpose: 'QUICK_CONSULT',
      referenceId: consultationId,
      reason,
    } satisfies PaymentRefundRequestedEvent);
  }

  private async closeChat(consultationId: string, systemText: string | null): Promise<void> {
    const conversation = (await this.chat.conversationIdsFor([consultationId])).get(consultationId);
    if (!conversation) return;
    if (systemText) await this.chat.postSystem(conversation.id, systemText);
    await this.chat.close(conversation.id);
  }

  /** Tell the online doctors who could take this kind to refetch their queue. */
  private async queueChanged(kind: QuickConsultKind | null): Promise<void> {
    const providers = await this.directory.onlineQuickConsultProviders(
      requiredGenderFor(kind ?? 'GENERAL'),
    );
    if (providers.length === 0) return;
    const waiting = await this.prisma.consultation.count({
      where: { tier: 'QUICK', status: 'WAITING' },
    });
    this.realtime.toUsers(
      providers.map((p) => p.userId),
      REALTIME_EVENTS.QUICK_QUEUE_CHANGED,
      { waiting } satisfies QuickQueueChangedEvent,
    );
    this.logger.debug(`quick queue: ${waiting} waiting`);
  }
}
