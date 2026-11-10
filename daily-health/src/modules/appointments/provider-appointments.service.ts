import { HttpStatus, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { emitAuditEvent } from '../../common/events/audit-event.js';
import { AppException } from '../../common/errors/app-exception.js';
import {
  addDays,
  dateColumnToString,
  dhakaDate,
  stringToDateColumn,
} from '../../common/time/dhaka-time.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import type { Appointment } from '../../generated/prisma/client.js';
import type {
  CompleteAppointmentRequest,
  ProviderAppointmentResponse,
  ProviderCalendarDayResponse,
  ProviderCalendarQuery,
} from '../../shared-contracts/appointments.contract.js';
import { FavoriteProvidersService } from '../doctors/favorite-providers.service.js';
import { ProviderDirectoryService } from '../doctors/provider-directory.service.js';
import {
  appointmentNotFound,
  logStatus,
  statusConflict,
} from './appointment-booking.service.js';
import {
  APPOINTMENT_CANCELLED_EVENT,
  APPOINTMENT_COMPLETED_EVENT,
  type AppointmentEvent,
} from './appointment-events.js';
import { AppointmentRemindersService } from './appointment-reminders.service.js';
import { AppointmentViewsService } from './appointment-views.service.js';
import { AppointmentsErrorCode } from './appointments-error-codes.js';
import { FollowUpsService } from './follow-ups.service.js';

const DAY_MS = 24 * 60 * 60_000;

/** A provider's appointments in the web panel. */
@Injectable()
export class ProviderAppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly directory: ProviderDirectoryService,
    private readonly views: AppointmentViewsService,
    private readonly reminders: AppointmentRemindersService,
    private readonly followUps: FollowUpsService,
    private readonly favorites: FavoriteProvidersService,
    private readonly events: EventEmitter2,
  ) {}

  /** One day, in serial / time order. Expired holds are left out. */
  async day(
    userId: string,
    date?: string,
  ): Promise<ProviderAppointmentResponse[]> {
    const provider = await this.directory.requireOwn(userId);
    const rows = await this.prisma.appointment.findMany({
      where: {
        providerId: provider.id,
        sessionDate: stringToDateColumn(date ?? dhakaDate()),
        status: { not: 'EXPIRED' },
      },
      orderBy: [{ scheduledAt: 'asc' }, { serialNo: 'asc' }],
    });
    return this.views.forProvider(rows);
  }

  async calendar(
    userId: string,
    query: ProviderCalendarQuery,
  ): Promise<ProviderCalendarDayResponse[]> {
    const provider = await this.directory.requireOwn(userId);
    const from = query.from ?? dhakaDate();
    const counts = await this.prisma.appointment.groupBy({
      by: ['sessionDate', 'status'],
      where: {
        providerId: provider.id,
        sessionDate: {
          gte: stringToDateColumn(from),
          lte: stringToDateColumn(addDays(from, query.days - 1)),
        },
        status: { in: ['CONFIRMED', 'PENDING_PAYMENT', 'COMPLETED'] },
      },
      _count: { _all: true },
    });
    return Array.from({ length: query.days }, (_, index) => {
      const date = addDays(from, index);
      const of = (status: string) =>
        counts.find(
          (c) => dateColumnToString(c.sessionDate) === date && c.status === status,
        )?._count._all ?? 0;
      return {
        date,
        confirmed: of('CONFIRMED'),
        pendingPayment: of('PENDING_PAYMENT'),
        completed: of('COMPLETED'),
      };
    });
  }

  async get(
    userId: string,
    appointmentId: string,
  ): Promise<ProviderAppointmentResponse> {
    const row = await this.require(userId, appointmentId);
    emitAuditEvent(this.events, {
      actorUserId: userId,
      patientId: row.patientId,
      action: 'appointment.provider_view',
      entityType: 'Appointment',
      entityId: row.id,
    });
    const [view] = await this.views.forProvider([row]);
    return view!;
  }

  async complete(
    userId: string,
    appointmentId: string,
    input: CompleteAppointmentRequest,
  ): Promise<ProviderAppointmentResponse> {
    const row = await this.require(userId, appointmentId);
    if (row.status !== 'CONFIRMED') throw statusConflict();
    if (row.scheduledAt.getTime() > Date.now()) throw notStarted();
    const updated = await this.transition(row, 'COMPLETED', userId);

    const provider = (await this.directory.findById(row.providerId))!;
    if (input.followUpInDays) {
      const chamber = row.chamberId
        ? (await this.directory.chambersByIds([row.chamberId])).get(
            row.chamberId,
          )
        : null;
      await this.followUps.createFromVisit({
        patientId: row.patientId,
        appointmentId: row.id,
        providerId: row.providerId,
        doctorName: `${provider.type === 'DOCTOR' ? 'ডা. ' : ''}${provider.displayName}`,
        location: chamber?.hospital.name ?? null,
        mode: row.mode === 'CHAT' ? 'VIDEO' : row.mode,
        dueAt: new Date(row.scheduledAt.getTime() + input.followUpInDays * DAY_MS),
        note: input.followUpNote ?? null,
        notifyUserId: row.bookedByUserId,
      });
    }
    // The provider joins the patient's "my doctors".
    await this.favorites.addSilently(row.patientId, row.providerId);
    this.events.emit(APPOINTMENT_COMPLETED_EVENT, {
      appointmentId: row.id,
      patientId: row.patientId,
      providerId: row.providerId,
      actorUserId: userId,
    } satisfies AppointmentEvent);
    await this.reminders.cancelAppointmentReminders([row.id]);
    const [view] = await this.views.forProvider([updated]);
    return view!;
  }

  async markNoShow(
    userId: string,
    appointmentId: string,
  ): Promise<ProviderAppointmentResponse> {
    const row = await this.require(userId, appointmentId);
    if (row.status !== 'CONFIRMED') throw statusConflict();
    if (row.scheduledAt.getTime() > Date.now()) throw notStarted();
    const updated = await this.transition(row, 'NO_SHOW', userId);
    await this.reminders.cancelAppointmentReminders([row.id]);
    const [view] = await this.views.forProvider([updated]);
    return view!;
  }

  /** The patient is told by push and SMS; a paid booking is refunded (step 6). */
  async cancel(
    userId: string,
    appointmentId: string,
    reason: string,
  ): Promise<ProviderAppointmentResponse> {
    const row = await this.require(userId, appointmentId);
    if (row.status !== 'CONFIRMED' && row.status !== 'PENDING_PAYMENT') {
      throw statusConflict();
    }
    const updated = await this.transition(row, 'CANCELLED', userId, reason);
    this.events.emit(APPOINTMENT_CANCELLED_EVENT, {
      appointmentId: row.id,
      patientId: row.patientId,
      providerId: row.providerId,
      actorUserId: userId,
      wasConfirmed: row.status === 'CONFIRMED',
      cancelledBy: 'PROVIDER',
    } satisfies AppointmentEvent);
    await this.reminders.onCancelledByProvider(updated, reason);
    const [view] = await this.views.forProvider([updated]);
    return view!;
  }

  private async transition(
    row: Appointment,
    toStatus: 'COMPLETED' | 'NO_SHOW' | 'CANCELLED',
    userId: string,
    cancelReason?: string,
  ): Promise<Appointment> {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.appointment.updateMany({
        where: { id: row.id, status: row.status },
        data: {
          status: toStatus,
          holdExpiresAt: null,
          ...(toStatus === 'CANCELLED'
            ? {
                cancelledBy: 'PROVIDER',
                cancelReason: cancelReason ?? null,
                cancelledAt: new Date(),
              }
            : {}),
        },
      });
      if (updated.count === 0) throw statusConflict();
      await logStatus(tx, row.id, row.status, toStatus, userId);
      return tx.appointment.findUniqueOrThrow({ where: { id: row.id } });
    });
  }

  private async require(userId: string, appointmentId: string) {
    const provider = await this.directory.requireOwn(userId);
    const row = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, providerId: provider.id },
    });
    if (!row) throw appointmentNotFound();
    return row;
  }
}

function notStarted(): AppException {
  return new AppException(
    AppointmentsErrorCode.APPOINTMENT_NOT_STARTED,
    'The visit has not started yet',
    HttpStatus.CONFLICT,
  );
}
