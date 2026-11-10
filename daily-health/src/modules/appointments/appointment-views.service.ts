import { Injectable } from '@nestjs/common';
import {
  dateColumnToString,
  dhakaTimeOfDay,
} from '../../common/time/dhaka-time.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import type {
  Appointment,
  PatientProfile,
} from '../../generated/prisma/client.js';
import {
  PATIENT_CANCEL_CUTOFF_HOURS,
  type AppointmentResponse,
  type FollowUpResponse,
  type ProviderAppointmentResponse,
} from '../../shared-contracts/appointments.contract.js';
import { ProviderDirectoryService } from '../doctors/provider-directory.service.js';
import { ProviderReviewsService } from '../doctors/provider-reviews.service.js';
import { PaymentsService } from '../payments/payments.service.js';
import { PatientProfilesService } from '../users/patient-profiles.service.js';

const HOUR_MS = 60 * 60_000;

/** IN_PERSON: rough time of a serial, spreading the session evenly. */
export function estimatedSerialTime(appointment: Appointment): Date | null {
  if (appointment.mode !== 'IN_PERSON' || !appointment.serialNo) return null;
  return new Date(
    appointment.scheduledAt.getTime() +
      (appointment.serialNo - 1) * appointment.durationMin * 60_000,
  );
}

export function patientCanCancel(
  appointment: Appointment,
  now = new Date(),
): boolean {
  if (appointment.status === 'PENDING_PAYMENT') return true;
  if (appointment.status !== 'CONFIRMED') return false;
  return (
    appointment.scheduledAt.getTime() - now.getTime() >=
    PATIENT_CANCEL_CUTOFF_HOURS * HOUR_MS
  );
}

/** Years from a date of birth (Asia/Dhaka calendar is close enough here). */
export function ageInYears(dateOfBirth: Date, now = new Date()): number {
  let age = now.getUTCFullYear() - dateOfBirth.getUTCFullYear();
  const beforeBirthday =
    now.getUTCMonth() < dateOfBirth.getUTCMonth() ||
    (now.getUTCMonth() === dateOfBirth.getUTCMonth() &&
      now.getUTCDate() < dateOfBirth.getUTCDate());
  if (beforeBirthday) age -= 1;
  return Math.max(0, age);
}

/**
 * Builds appointment responses in batches: provider, chamber, patient and
 * review data come from their own modules' services (CLAUDE.md §4).
 */
@Injectable()
export class AppointmentViewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly directory: ProviderDirectoryService,
    private readonly reviews: ProviderReviewsService,
    private readonly profiles: PatientProfilesService,
    private readonly payments: PaymentsService,
  ) {}

  async forPatient(rows: Appointment[]): Promise<AppointmentResponse[]> {
    if (rows.length === 0) return [];
    const [providers, chambers, patients, reviews, payments] = await Promise.all([
      this.directory.summariesByIds(rows.map((r) => r.providerId)),
      this.directory.chambersByIds(
        rows.flatMap((r) => (r.chamberId ? [r.chamberId] : [])),
      ),
      this.profiles.findManyByIds(rows.map((r) => r.patientId)),
      this.reviews.byAppointmentIds(
        rows.filter((r) => r.status === 'COMPLETED').map((r) => r.id),
      ),
      this.payments.summariesForReferences(
        'APPOINTMENT',
        rows.map((r) => r.id),
      ),
    ]);
    const now = new Date();
    return rows.map((row) => {
      const patient = patients.get(row.patientId);
      const review = reviews.get(row.id) ?? null;
      const estimated = estimatedSerialTime(row);
      const paid = payments.get(row.id) ?? null;
      return {
        id: row.id,
        code: row.code,
        patientId: row.patientId,
        patientName: patient?.fullName ?? '',
        patientCode: patient?.patientCode ?? '',
        provider: providers.get(row.providerId)!,
        chamber: row.chamberId ? (chambers.get(row.chamberId) ?? null) : null,
        mode: row.mode,
        kind: row.kind,
        parentAppointmentId: row.parentAppointmentId,
        date: dateColumnToString(row.sessionDate),
        scheduledAt: row.scheduledAt.toISOString(),
        sessionStartTime: dhakaTimeOfDay(row.scheduledAt),
        sessionEndTime: dhakaTimeOfDay(row.sessionEndAt),
        durationMin: row.durationMin,
        serialNo: row.serialNo,
        estimatedAt: estimated?.toISOString() ?? null,
        status: row.status,
        reason: row.reason,
        homeAddress: row.homeAddress,
        fee: row.fee.toNumber(),
        payment: {
          required: row.fee.toNumber() > 0,
          amount: row.fee.toNumber(),
          payBefore: row.holdExpiresAt?.toISOString() ?? null,
          paymentId: paid?.paymentId ?? null,
          invoiceNo: paid?.invoiceNo ?? null,
          method: paid?.method ?? null,
          paidAt: paid?.paidAt ?? null,
          refund: paid?.refund ?? null,
        },
        cancelledBy: row.cancelledBy,
        cancelReason: row.cancelReason,
        canCancel: patientCanCancel(row, now),
        canReview: row.status === 'COMPLETED' && review === null,
        myReview: review,
        createdAt: row.createdAt.toISOString(),
      };
    });
  }

  async forProvider(
    rows: Appointment[],
  ): Promise<ProviderAppointmentResponse[]> {
    if (rows.length === 0) return [];
    const [chambers, patients, previous, followUps] = await Promise.all([
      this.directory.chambersByIds(
        rows.flatMap((r) => (r.chamberId ? [r.chamberId] : [])),
      ),
      this.profiles.findManyByIds(rows.map((r) => r.patientId)),
      this.previousVisitCounts(rows),
      this.prisma.followUpReminder.findMany({
        where: {
          appointmentId: { in: rows.map((r) => r.id) },
          status: { not: 'CANCELLED' },
        },
        select: { appointmentId: true, dueAt: true },
      }),
    ]);
    const followUpByAppointment = new Map(
      followUps.map((f) => [f.appointmentId, f.dueAt]),
    );
    return rows.map((row) => {
      const patient = patients.get(row.patientId);
      const estimated = estimatedSerialTime(row);
      return {
        id: row.id,
        code: row.code,
        patient: toProviderPatient(
          row.patientId,
          patient,
          // The counts include this visit once it is completed.
          (previous.get(`${row.patientId}:${row.providerId}`) ?? 0) -
            (row.status === 'COMPLETED' ? 1 : 0),
        ),
        mode: row.mode,
        kind: row.kind,
        chamber: row.chamberId ? (chambers.get(row.chamberId) ?? null) : null,
        date: dateColumnToString(row.sessionDate),
        scheduledAt: row.scheduledAt.toISOString(),
        sessionStartTime: dhakaTimeOfDay(row.scheduledAt),
        sessionEndTime: dhakaTimeOfDay(row.sessionEndAt),
        serialNo: row.serialNo,
        estimatedAt: estimated?.toISOString() ?? null,
        durationMin: row.durationMin,
        status: row.status,
        reason: row.reason,
        homeAddress: row.homeAddress,
        fee: row.fee.toNumber(),
        cancelledBy: row.cancelledBy,
        cancelReason: row.cancelReason,
        followUpDueAt:
          followUpByAppointment.get(row.id)?.toISOString() ?? null,
      };
    });
  }

  /** Completed visits of each patient with each provider, before this one. */
  private async previousVisitCounts(
    rows: Appointment[],
  ): Promise<Map<string, number>> {
    const counts = await this.prisma.appointment.groupBy({
      by: ['patientId', 'providerId'],
      where: {
        status: 'COMPLETED',
        patientId: { in: [...new Set(rows.map((r) => r.patientId))] },
        providerId: { in: [...new Set(rows.map((r) => r.providerId))] },
      },
      _count: { _all: true },
    });
    return new Map(
      counts.map((c) => [`${c.patientId}:${c.providerId}`, c._count._all]),
    );
  }
}

function toProviderPatient(
  patientId: string,
  patient: PatientProfile | undefined,
  previousVisits: number,
): ProviderAppointmentResponse['patient'] {
  return {
    id: patientId,
    patientCode: patient?.patientCode ?? '',
    fullName: patient?.fullName ?? '',
    gender: patient?.gender ?? 'OTHER',
    age: patient?.dateOfBirth ? ageInYears(patient.dateOfBirth) : null,
    previousVisits,
  };
}

export function toFollowUpResponse(row: {
  id: string;
  doctorName: string;
  location: string | null;
  mode: FollowUpResponse['mode'];
  dueAt: Date;
  status: FollowUpResponse['status'];
  note: string | null;
  appointmentId: string | null;
  providerId: string | null;
  createdAt: Date;
}): FollowUpResponse {
  return {
    id: row.id,
    doctorName: row.doctorName,
    location: row.location,
    mode: row.mode,
    dueAt: row.dueAt.toISOString(),
    status: row.status,
    note: row.note,
    appointmentId: row.appointmentId,
    providerId: row.providerId,
    createdAt: row.createdAt.toISOString(),
  };
}
