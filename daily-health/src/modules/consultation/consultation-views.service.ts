import { Injectable } from '@nestjs/common';
import type { Consultation } from '../../generated/prisma/client.js';
import type {
  ConsultPatientInfo,
  ConsultationResponse,
  QuickConsultQueueItemResponse,
} from '../../shared-contracts/consultation.contract.js';
import type { PaymentStatus } from '../../shared-contracts/payments.contract.js';
import { AppointmentLookupService } from '../appointments/appointment-lookup.service.js';
import { ChatService } from '../chat/chat.service.js';
import { ProviderDirectoryService } from '../doctors/provider-directory.service.js';
import { PaymentsService } from '../payments/payments.service.js';
import { PatientProfilesService } from '../users/patient-profiles.service.js';

type ConsultationRow = Consultation & {
  queueEntry?: { enqueuedAt: Date } | null;
};

/** Builds consultation responses with batched lookups in the modules that own the data. */
@Injectable()
export class ConsultationViewsService {
  constructor(
    private readonly profiles: PatientProfilesService,
    private readonly directory: ProviderDirectoryService,
    private readonly appointments: AppointmentLookupService,
    private readonly chat: ChatService,
    private readonly payments: PaymentsService,
  ) {}

  async one(row: ConsultationRow): Promise<ConsultationResponse> {
    const [response] = await this.many([row]);
    return response!;
  }

  async many(rows: ConsultationRow[]): Promise<ConsultationResponse[]> {
    const [patients, providers, appointments, conversations, payments] = await Promise.all([
      this.profiles.findManyByIds(rows.map((r) => r.patientId)),
      this.directory.summariesByIds(rows.flatMap((r) => (r.providerId ? [r.providerId] : []))),
      this.appointments.findManyByIds(rows.flatMap((r) => (r.appointmentId ? [r.appointmentId] : []))),
      this.chat.conversationIdsFor(rows.map((r) => r.id)),
      this.payments.summariesForReferences(
        'QUICK_CONSULT',
        rows.filter((r) => r.tier === 'QUICK').map((r) => r.id),
      ),
    ]);
    return rows.map((row) => {
      const appointment = row.appointmentId ? appointments.get(row.appointmentId) : undefined;
      const conversation = conversations.get(row.id);
      const payment = payments.get(row.id);
      const isCall = row.channel !== 'CHAT';
      return {
        id: row.id,
        tier: row.tier,
        channel: row.channel,
        status: row.status,
        quickKind: row.quickKind,
        appointmentId: row.appointmentId,
        appointmentCode: appointment?.code ?? null,
        scheduledAt: appointment?.scheduledAt.toISOString() ?? null,
        patient: patientInfo(patients.get(row.patientId), row.patientId),
        provider: row.providerId ? (providers.get(row.providerId) ?? null) : null,
        fee: row.fee.toNumber(),
        conversationId: conversation?.id ?? null,
        chatOpen: Boolean(conversation?.isOpen) && ['WAITING', 'ONGOING'].includes(row.status),
        waitingUntil: row.status === 'WAITING' ? (row.waitingUntil?.toISOString() ?? null) : null,
        endsAt: row.status === 'ONGOING' ? (row.endsAt?.toISOString() ?? null) : null,
        startedAt: row.startedAt?.toISOString() ?? null,
        endedAt: row.endedAt?.toISOString() ?? null,
        durationSec: row.durationSec,
        call: isCall
          ? { active: row.callActive, ringingAt: row.ringingAt?.toISOString() ?? null }
          : null,
        paymentStatus: row.tier === 'QUICK' ? paymentStatus(payment?.refund?.status, Boolean(payment)) : null,
        createdAt: row.createdAt.toISOString(),
      };
    });
  }

  /** Queue items for doctors: age and gender only until a doctor accepts. */
  async queueItems(rows: ConsultationRow[]): Promise<QuickConsultQueueItemResponse[]> {
    const patients = await this.profiles.findManyByIds(rows.map((r) => r.patientId));
    return rows.map((row) => {
      const info = patientInfo(patients.get(row.patientId), row.patientId);
      return {
        consultationId: row.id,
        kind: row.quickKind ?? 'GENERAL',
        patientGender: info.gender,
        patientAgeYears: info.ageYears,
        fee: row.fee.toNumber(),
        waitingSince: (row.queueEntry?.enqueuedAt ?? row.createdAt).toISOString(),
        waitingUntil: (row.waitingUntil ?? row.createdAt).toISOString(),
      };
    });
  }
}

function paymentStatus(
  refund: 'REQUESTED' | 'PROCESSED' | 'FAILED' | undefined,
  paid: boolean,
): PaymentStatus | null {
  if (!paid) return null;
  return refund === 'PROCESSED' ? 'REFUNDED' : 'SUCCESS';
}

export function patientInfo(
  profile:
    | { id: string; patientCode: string; fullName: string; gender: string; dateOfBirth: Date | null }
    | undefined,
  fallbackId: string,
): ConsultPatientInfo {
  if (!profile) {
    return { id: fallbackId, patientCode: '', fullName: '', gender: null, ageYears: null };
  }
  return {
    id: profile.id,
    patientCode: profile.patientCode,
    fullName: profile.fullName,
    gender: profile.gender,
    ageYears: profile.dateOfBirth ? ageInYears(profile.dateOfBirth) : null,
  };
}

function ageInYears(dateOfBirth: Date, now = new Date()): number {
  let age = now.getUTCFullYear() - dateOfBirth.getUTCFullYear();
  const beforeBirthday =
    now.getUTCMonth() < dateOfBirth.getUTCMonth() ||
    (now.getUTCMonth() === dateOfBirth.getUTCMonth() && now.getUTCDate() < dateOfBirth.getUTCDate());
  if (beforeBirthday) age -= 1;
  return Math.max(0, age);
}
