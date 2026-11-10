import { InjectQueue } from '@nestjs/bullmq';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import type { Queue } from 'bullmq';
import { AppException } from '../../common/errors/app-exception.js';
import {
  addDays,
  dhakaDate,
  dhakaWallTimeToUtc,
  stringToDateColumn,
} from '../../common/time/dhaka-time.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { ReadableIdService } from '../../core/readable-ids/readable-id.service.js';
import {
  Prisma,
  type Appointment,
  type AppointmentStatus,
} from '../../generated/prisma/client.js';
import {
  APPOINTMENT_HOLD_MINUTES,
  BOOKING_WINDOW_DAYS,
  type AppointmentResponse,
  type BookAppointmentRequest,
} from '../../shared-contracts/appointments.contract.js';
import { ProviderDirectoryService } from '../doctors/provider-directory.service.js';
import { slotTimes, toMinutes } from '../doctors/session-calendar.js';
import type { ProfileAccess } from '../users/profile-access.service.js';
import {
  LIVE_STATUSES,
  lowestFreeSerial,
  sessionOpen,
  slotOpen,
} from './appointment-availability.service.js';
import {
  APPOINTMENT_CANCELLED_EVENT,
  APPOINTMENT_CONFIRMED_EVENT,
  PAYMENT_SUCCEEDED_EVENT,
  type AppointmentEvent,
  type PaymentSucceededEvent,
} from './appointment-events.js';
import { AppointmentRemindersService } from './appointment-reminders.service.js';
import { AppointmentViewsService } from './appointment-views.service.js';
import { AppointmentsErrorCode } from './appointments-error-codes.js';

export const APPOINTMENT_HOLDS_QUEUE = 'appointment-holds';
export const EXPIRE_HOLD_JOB = 'expire-hold';

type Tx = Prisma.TransactionClient;

/**
 * Booking (erd.md → "অ্যাপয়েন্টমেন্ট ও ফলো-আপ"):
 * - A paid booking holds its serial or slot as PENDING_PAYMENT for
 *   APPOINTMENT_HOLD_MINUTES; a delayed BullMQ job (and a sweep) EXPIRE it.
 * - `payment.succeeded` from the payments module confirms it. A free
 *   booking is confirmed at once.
 * - Double booking: a transaction-scoped advisory lock per provider and day
 *   serialises bookings (the schedule row belongs to the doctors module, so it
 *   is not locked with FOR UPDATE), and partial unique indexes back it up.
 */
@Injectable()
export class AppointmentBookingService {
  private readonly logger = new Logger(AppointmentBookingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly readableIds: ReadableIdService,
    private readonly directory: ProviderDirectoryService,
    private readonly views: AppointmentViewsService,
    private readonly reminders: AppointmentRemindersService,
    private readonly events: EventEmitter2,
    @InjectQueue(APPOINTMENT_HOLDS_QUEUE) private readonly holds: Queue,
  ) {}

  async book(
    userId: string,
    access: ProfileAccess,
    input: BookAppointmentRequest,
  ): Promise<AppointmentResponse> {
    const patientId = access.profile.id;
    const today = dhakaDate();
    if (input.date < today) throw sessionClosed();
    if (input.date > addDays(today, BOOKING_WINDOW_DAYS)) {
      throw new AppException(
        AppointmentsErrorCode.BOOKING_TOO_FAR,
        `Bookings open ${BOOKING_WINDOW_DAYS} days ahead`,
      );
    }

    const context = await this.directory.bookingContext(
      input.providerId,
      input.scheduleId,
      input.date,
    );
    const session = context.session;
    if (!session) {
      throw new AppException(
        AppointmentsErrorCode.SESSION_NOT_AVAILABLE,
        'No such session on that date',
        HttpStatus.CONFLICT,
      );
    }
    const mode = session.schedule.mode;
    if (mode === 'HOME_VISIT' && !input.homeAddress) {
      throw new AppException(
        AppointmentsErrorCode.HOME_ADDRESS_REQUIRED,
        'A home visit needs the address',
      );
    }

    let fee = session.fee;
    if (input.parentAppointmentId) {
      const parent = await this.prisma.appointment.findFirst({
        where: {
          id: input.parentAppointmentId,
          patientId,
          providerId: input.providerId,
          status: 'COMPLETED',
        },
        select: { id: true },
      });
      if (!parent) {
        throw new AppException(
          AppointmentsErrorCode.INVALID_FOLLOW_UP,
          'The earlier visit is not a completed visit with this provider',
        );
      }
      if (mode === 'IN_PERSON' && context.followUpFee !== null) {
        fee = Math.min(fee, context.followUpFee);
      }
    }

    const now = new Date();
    let scheduledAt: Date;
    let sessionEndAt: Date;
    let durationMin: number;
    if (mode === 'IN_PERSON') {
      if (!sessionOpen(session, now)) throw sessionClosed();
      scheduledAt = dhakaWallTimeToUtc(input.date, session.startTime);
      sessionEndAt = dhakaWallTimeToUtc(input.date, session.endTime);
      const total = toMinutes(session.endTime) - toMinutes(session.startTime);
      durationMin = Math.max(
        5,
        Math.floor(total / (session.schedule.maxPatients ?? 1)),
      );
    } else {
      const slotMinutes = session.schedule.slotMinutes ?? 15;
      if (
        !input.slotTime ||
        !slotTimes(session.startTime, session.endTime, slotMinutes).includes(
          input.slotTime,
        )
      ) {
        throw slotNotAvailable();
      }
      if (!slotOpen(input.date, input.slotTime, now)) throw sessionClosed();
      scheduledAt = dhakaWallTimeToUtc(input.date, input.slotTime);
      durationMin = slotMinutes;
      sessionEndAt = new Date(scheduledAt.getTime() + slotMinutes * 60_000);
    }

    const needsPayment = fee > 0;
    let appointment: Appointment;
    try {
      appointment = await this.prisma.$transaction(async (tx) => {
        await lockProviderDay(tx, input.providerId, input.date);
        const live = await tx.appointment.findMany({
          where: {
            OR: [
              { scheduleId: input.scheduleId },
              { providerId: input.providerId, scheduledAt },
            ],
            sessionDate: stringToDateColumn(input.date),
            status: { in: LIVE_STATUSES },
          },
          select: {
            patientId: true,
            scheduleId: true,
            serialNo: true,
            scheduledAt: true,
          },
        });
        if (
          live.some(
            (a) => a.patientId === patientId && a.scheduleId === input.scheduleId,
          )
        ) {
          throw new AppException(
            AppointmentsErrorCode.ALREADY_BOOKED,
            'Already booked in this session',
            HttpStatus.CONFLICT,
          );
        }

        let serialNo: number | null = null;
        if (mode === 'IN_PERSON') {
          serialNo = lowestFreeSerial(
            new Set(
              live
                .filter((a) => a.scheduleId === input.scheduleId)
                .flatMap((a) => (a.serialNo ? [a.serialNo] : [])),
            ),
            session.schedule.maxPatients ?? 0,
          );
          if (serialNo === null) {
            throw new AppException(
              AppointmentsErrorCode.SESSION_FULL,
              'All serials are taken',
              HttpStatus.CONFLICT,
            );
          }
        } else if (
          live.some((a) => a.scheduledAt.getTime() === scheduledAt.getTime())
        ) {
          throw slotNotAvailable();
        }

        const created = await tx.appointment.create({
          data: {
            code: await this.readableIds.nextBookingCode(tx),
            patientId,
            bookedByUserId: userId,
            providerId: input.providerId,
            chamberId: session.chamber?.id ?? null,
            scheduleId: input.scheduleId,
            mode,
            kind: input.parentAppointmentId ? 'FOLLOW_UP' : 'NEW',
            parentAppointmentId: input.parentAppointmentId ?? null,
            sessionDate: stringToDateColumn(input.date),
            scheduledAt,
            sessionEndAt,
            durationMin,
            serialNo,
            status: needsPayment ? 'PENDING_PAYMENT' : 'CONFIRMED',
            holdExpiresAt: needsPayment
              ? new Date(now.getTime() + APPOINTMENT_HOLD_MINUTES * 60_000)
              : null,
            confirmedAt: needsPayment ? null : now,
            reason: input.reason ?? null,
            homeAddress: mode === 'HOME_VISIT' ? input.homeAddress! : null,
            lat: input.lat === undefined ? null : new Prisma.Decimal(input.lat),
            lng: input.lng === undefined ? null : new Prisma.Decimal(input.lng),
            fee: new Prisma.Decimal(fee),
          },
        });
        await logStatus(tx, created.id, null, created.status, userId);
        return created;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw slotNotAvailable();
      }
      throw error;
    }

    if (appointment.status === 'PENDING_PAYMENT') {
      await this.queueHoldExpiry(appointment);
    } else {
      await this.afterConfirmed(appointment, userId);
    }
    const [view] = await this.views.forPatient([appointment]);
    return view!;
  }

  /** Payment arrived (payments module, or the dev shortcut). Idempotent. */
  @OnEvent(PAYMENT_SUCCEEDED_EVENT, { async: true, promisify: true })
  async onPaymentSucceeded(event: PaymentSucceededEvent): Promise<void> {
    if (event.purpose !== 'APPOINTMENT') return;
    await this.confirmPaid(event.referenceId);
  }

  async confirmPaid(appointmentId: string): Promise<Appointment | null> {
    const current = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
    });
    if (!current) return null;
    if (current.status === 'CONFIRMED') return current;

    if (current.status === 'PENDING_PAYMENT' || current.status === 'EXPIRED') {
      try {
        const confirmed = await this.prisma.$transaction(async (tx) => {
          const updated = await tx.appointment.updateMany({
            where: {
              id: appointmentId,
              status: { in: ['PENDING_PAYMENT', 'EXPIRED'] },
            },
            data: {
              status: 'CONFIRMED',
              holdExpiresAt: null,
              confirmedAt: new Date(),
            },
          });
          if (updated.count === 0) return null;
          await logStatus(tx, appointmentId, current.status, 'CONFIRMED', null);
          return tx.appointment.findUniqueOrThrow({
            where: { id: appointmentId },
          });
        });
        if (confirmed) await this.afterConfirmed(confirmed, null);
        return confirmed;
      } catch (error) {
        // Paid after the hold expired and someone else took the slot.
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          this.logger.warn(
            `Payment for expired appointment ${appointmentId} could not reclaim its slot; refund needed`,
          );
          this.events.emit(APPOINTMENT_CANCELLED_EVENT, {
            appointmentId,
            patientId: current.patientId,
            providerId: current.providerId,
            actorUserId: null,
            wasConfirmed: true,
            cancelledBy: 'SYSTEM',
          } satisfies AppointmentEvent);
          return null;
        }
        throw error;
      }
    }
    // Paid after it was cancelled or finished: the money goes back.
    this.logger.warn(
      `Payment for appointment ${appointmentId} in status ${current.status}; refunding`,
    );
    this.events.emit(APPOINTMENT_CANCELLED_EVENT, {
      appointmentId,
      patientId: current.patientId,
      providerId: current.providerId,
      actorUserId: null,
      wasConfirmed: true,
      cancelledBy: 'SYSTEM',
    } satisfies AppointmentEvent);
    return null;
  }

  /** Worker: the hold ran out without payment. Safe to run twice. */
  async expireHold(appointmentId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.appointment.updateMany({
        where: {
          id: appointmentId,
          status: 'PENDING_PAYMENT',
          holdExpiresAt: { lte: new Date() },
        },
        data: { status: 'EXPIRED', holdExpiresAt: null },
      });
      if (updated.count > 0) {
        await logStatus(tx, appointmentId, 'PENDING_PAYMENT', 'EXPIRED', null);
      }
    });
  }

  /** Sweep for holds whose job was lost (Redis restart). */
  async expireOverdueHolds(): Promise<number> {
    const overdue = await this.prisma.appointment.findMany({
      where: { status: 'PENDING_PAYMENT', holdExpiresAt: { lte: new Date() } },
      select: { id: true },
      take: 500,
    });
    for (const row of overdue) await this.expireHold(row.id);
    return overdue.length;
  }

  private async queueHoldExpiry(appointment: Appointment): Promise<void> {
    try {
      await this.holds.add(
        EXPIRE_HOLD_JOB,
        { appointmentId: appointment.id },
        {
          jobId: `hold-${appointment.id}`,
          delay: Math.max(
            0,
            (appointment.holdExpiresAt?.getTime() ?? Date.now()) - Date.now(),
          ),
          attempts: 3,
          backoff: { type: 'exponential', delay: 5_000 },
          removeOnComplete: true,
          removeOnFail: { age: 7 * 24 * 3600 },
        },
      );
    } catch (error) {
      // The sweep expires it anyway.
      this.logger.warn(
        `Could not queue hold expiry for ${appointment.id}: ${(error as Error).message}`,
      );
    }
  }

  private async afterConfirmed(
    appointment: Appointment,
    actorUserId: string | null,
  ): Promise<void> {
    this.events.emit(APPOINTMENT_CONFIRMED_EVENT, {
      appointmentId: appointment.id,
      patientId: appointment.patientId,
      providerId: appointment.providerId,
      actorUserId,
    } satisfies AppointmentEvent);
    await this.reminders.onConfirmed(appointment);
  }
}

/** Serialises bookings for one provider on one day (released at commit). */
async function lockProviderDay(
  tx: Tx,
  providerId: string,
  date: string,
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`booking:${providerId}:${date}`}, 0))`;
}

export async function logStatus(
  tx: Tx,
  appointmentId: string,
  fromStatus: AppointmentStatus | null,
  toStatus: AppointmentStatus,
  changedByUserId: string | null,
): Promise<void> {
  await tx.appointmentStatusLog.create({
    data: { appointmentId, fromStatus, toStatus, changedByUserId },
  });
}

export function appointmentNotFound(): AppException {
  return new AppException(
    AppointmentsErrorCode.APPOINTMENT_NOT_FOUND,
    'Appointment not found',
    HttpStatus.NOT_FOUND,
  );
}

export function statusConflict(): AppException {
  return new AppException(
    AppointmentsErrorCode.APPOINTMENT_STATUS_CONFLICT,
    'Not possible in the current status',
    HttpStatus.CONFLICT,
  );
}

function sessionClosed(): AppException {
  return new AppException(
    AppointmentsErrorCode.SESSION_CLOSED,
    'This session is over or too soon to book',
    HttpStatus.CONFLICT,
  );
}

function slotNotAvailable(): AppException {
  return new AppException(
    AppointmentsErrorCode.SLOT_NOT_AVAILABLE,
    'That time is not available',
    HttpStatus.CONFLICT,
  );
}
