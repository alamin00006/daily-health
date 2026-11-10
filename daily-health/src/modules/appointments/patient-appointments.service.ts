import { HttpStatus, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { emitAuditEvent } from '../../common/events/audit-event.js';
import { AppException } from '../../common/errors/app-exception.js';
import {
  afterCursor,
  decodeCursor,
  encodeCursor,
  toKeysetPage,
} from '../../common/pagination/keyset-cursor.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type {
  AppointmentResponse,
  CancelAppointmentRequest,
  ListAppointmentsQuery,
  ReviewAppointmentRequest,
} from '../../shared-contracts/appointments.contract.js';
import type { PaginatedResponse } from '../../shared-contracts/common-fields.contract.js';
import { ProviderReviewsService } from '../doctors/provider-reviews.service.js';
import type { ProfileAccess } from '../users/profile-access.service.js';
import {
  appointmentNotFound,
  logStatus,
  statusConflict,
} from './appointment-booking.service.js';
import {
  APPOINTMENT_CANCELLED_EVENT,
  type AppointmentEvent,
} from './appointment-events.js';
import { AppointmentRemindersService } from './appointment-reminders.service.js';
import {
  AppointmentViewsService,
  patientCanCancel,
} from './appointment-views.service.js';
import { AppointmentsErrorCode } from './appointments-error-codes.js';

/** A patient profile's appointments: list, detail, cancel, review. */
@Injectable()
export class PatientAppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly views: AppointmentViewsService,
    private readonly reminders: AppointmentRemindersService,
    private readonly reviews: ProviderReviewsService,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * upcoming: waiting for payment or confirmed and not over, soonest first.
   * past: everything else, newest first.
   */
  async list(
    access: ProfileAccess,
    query: ListAppointmentsQuery,
  ): Promise<PaginatedResponse<AppointmentResponse>> {
    const now = new Date();
    const patientId = access.profile.id;
    const upcomingWhere: Prisma.AppointmentWhereInput = {
      status: { in: ['PENDING_PAYMENT', 'CONFIRMED'] },
      sessionEndAt: { gt: now },
    };

    if (query.scope === 'past') {
      const rows = await this.prisma.appointment.findMany({
        where: {
          patientId,
          NOT: upcomingWhere,
          ...afterCursor('scheduledAt', query.cursor),
        },
        orderBy: [{ scheduledAt: 'desc' }, { id: 'desc' }],
        take: query.limit + 1,
      });
      const page = toKeysetPage(rows, query.limit, (r) => r.scheduledAt, (r) => r);
      return { data: await this.views.forPatient(page.data), meta: page.meta };
    }

    // Soonest first: the keyset runs ascending.
    const after = query.cursor ? decodeCursor(query.cursor) : null;
    const rows = await this.prisma.appointment.findMany({
      where: {
        patientId,
        ...upcomingWhere,
        ...(after
          ? {
              OR: [
                { scheduledAt: { gt: after.at } },
                { scheduledAt: after.at, id: { gt: after.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
      take: query.limit + 1,
    });
    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const last = page.at(-1);
    return {
      data: await this.views.forPatient(page),
      meta: {
        cursor:
          hasMore && last
            ? encodeCursor({ at: last.scheduledAt, id: last.id })
            : null,
        hasMore,
      },
    };
  }

  async get(
    userId: string,
    access: ProfileAccess,
    appointmentId: string,
  ): Promise<AppointmentResponse> {
    const row = await this.require(access, appointmentId);
    emitAuditEvent(this.events, {
      actorUserId: userId,
      patientId: access.profile.id,
      action: 'appointment.view',
      entityType: 'Appointment',
      entityId: row.id,
    });
    const [view] = await this.views.forPatient([row]);
    return view!;
  }

  async cancel(
    userId: string,
    access: ProfileAccess,
    appointmentId: string,
    input: CancelAppointmentRequest,
  ): Promise<AppointmentResponse> {
    const row = await this.require(access, appointmentId);
    if (!patientCanCancel(row)) {
      if (row.status === 'CONFIRMED') {
        throw new AppException(
          AppointmentsErrorCode.TOO_LATE_TO_CANCEL,
          'Too close to the visit to cancel',
          HttpStatus.CONFLICT,
        );
      }
      throw statusConflict();
    }
    const cancelled = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.appointment.updateMany({
        where: { id: row.id, status: row.status },
        data: {
          status: 'CANCELLED',
          cancelledBy: 'PATIENT',
          cancelReason: input.reason ?? null,
          cancelledAt: new Date(),
          holdExpiresAt: null,
        },
      });
      if (updated.count === 0) throw statusConflict();
      await logStatus(tx, row.id, row.status, 'CANCELLED', userId);
      return tx.appointment.findUniqueOrThrow({ where: { id: row.id } });
    });

    this.events.emit(APPOINTMENT_CANCELLED_EVENT, {
      appointmentId: row.id,
      patientId: row.patientId,
      providerId: row.providerId,
      actorUserId: userId,
      wasConfirmed: row.status === 'CONFIRMED',
      cancelledBy: 'PATIENT',
    } satisfies AppointmentEvent);
    await this.reminders.onCancelledByPatient(cancelled);
    const [view] = await this.views.forPatient([cancelled]);
    return view!;
  }

  async review(
    userId: string,
    access: ProfileAccess,
    appointmentId: string,
    input: ReviewAppointmentRequest,
  ): Promise<AppointmentResponse> {
    const row = await this.require(access, appointmentId);
    if (row.status !== 'COMPLETED') {
      throw new AppException(
        AppointmentsErrorCode.REVIEW_NOT_ALLOWED,
        'Only a completed visit can be reviewed',
        HttpStatus.CONFLICT,
      );
    }
    await this.reviews.add({
      providerId: row.providerId,
      patientId: row.patientId,
      authorUserId: userId,
      appointmentId: row.id,
      rating: input.rating,
      comment: input.comment ?? null,
    });
    const [view] = await this.views.forPatient([row]);
    return view!;
  }

  async require(access: ProfileAccess, appointmentId: string) {
    const row = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, patientId: access.profile.id },
    });
    if (!row) throw appointmentNotFound();
    return row;
  }
}
