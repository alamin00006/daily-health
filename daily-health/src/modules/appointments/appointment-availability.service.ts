import { Injectable } from '@nestjs/common';
import {
  addDays,
  dhakaDate,
  dhakaWallTimeToUtc,
  stringToDateColumn,
} from '../../common/time/dhaka-time.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import type { AppointmentStatus } from '../../generated/prisma/client.js';
import {
  BOOKING_WINDOW_DAYS,
  type AvailabilityDayResponse,
  type AvailabilityQuery,
  type AvailabilitySessionResponse,
} from '../../shared-contracts/appointments.contract.js';
import {
  ProviderDirectoryService,
  type BookableSession,
} from '../doctors/provider-directory.service.js';
import { slotTimes } from '../doctors/session-calendar.js';

/** Bookings that still hold a serial or slot. */
export const LIVE_STATUSES: AppointmentStatus[] = [
  'PENDING_PAYMENT',
  'CONFIRMED',
  'COMPLETED',
  'NO_SHOW',
];

/** A time slot can be booked until this many minutes before it starts. */
export const SLOT_LEAD_MINUTES = 15;
/** Chamber serials close this many minutes before the session ends. */
export const SERIAL_CLOSE_BEFORE_END_MINUTES = 30;

/** Lowest serial not taken (a cancelled serial is given out again). */
export function lowestFreeSerial(
  taken: Set<number>,
  maxPatients: number,
): number | null {
  for (let serial = 1; serial <= maxPatients; serial += 1) {
    if (!taken.has(serial)) return serial;
  }
  return null;
}

/** Whether a session still takes bookings at `now` (ignoring capacity). */
export function sessionOpen(
  session: Pick<BookableSession, 'date' | 'endTime'>,
  now: Date,
): boolean {
  const closesAt =
    dhakaWallTimeToUtc(session.date, session.endTime).getTime() -
    SERIAL_CLOSE_BEFORE_END_MINUTES * 60_000;
  return now.getTime() < closesAt;
}

export function slotOpen(date: string, time: string, now: Date): boolean {
  return (
    dhakaWallTimeToUtc(date, time).getTime() - now.getTime() >=
    SLOT_LEAD_MINUTES * 60_000
  );
}

/**
 * Bookable sessions with live counts: serials left at a chamber, free time
 * slots online. The weekly schedules come from the doctors module; this
 * module adds what is already booked.
 */
@Injectable()
export class AppointmentAvailabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly directory: ProviderDirectoryService,
  ) {}

  async availability(
    providerId: string,
    query: AvailabilityQuery,
  ): Promise<AvailabilityDayResponse[]> {
    const today = dhakaDate();
    const from = !query.from || query.from < today ? today : query.from;
    const lastBookable = addDays(today, BOOKING_WINDOW_DAYS);
    if (from > lastBookable) return [];
    const days = Math.min(
      query.days,
      Math.round(
        (Date.parse(lastBookable) - Date.parse(from)) / 86_400_000,
      ) + 1,
    );

    const calendar = await this.directory.calendar(
      providerId,
      from,
      days,
      query.mode,
    );
    const booked = await this.prisma.appointment.findMany({
      where: {
        providerId,
        status: { in: LIVE_STATUSES },
        sessionDate: {
          gte: stringToDateColumn(from),
          lte: stringToDateColumn(addDays(from, days - 1)),
        },
      },
      select: {
        scheduleId: true,
        sessionDate: true,
        serialNo: true,
        scheduledAt: true,
        mode: true,
      },
    });
    const now = new Date();

    return calendar.map((day) => ({
      date: day.date,
      weekday: day.weekday,
      isOff: day.isOff,
      offNote: day.offNote,
      sessions: day.sessions.map((session) =>
        toSessionResponse(
          session,
          booked.filter(
            (b) =>
              b.scheduleId === session.schedule.id &&
              b.sessionDate.toISOString().slice(0, 10) === session.date,
          ),
          now,
        ),
      ),
    }));
  }
}

function toSessionResponse(
  session: BookableSession,
  booked: { serialNo: number | null; scheduledAt: Date }[],
  now: Date,
): AvailabilitySessionResponse {
  const base = {
    scheduleId: session.schedule.id,
    mode: session.schedule.mode,
    date: session.date,
    startTime: session.startTime,
    endTime: session.endTime,
    chamber: session.chamber,
    fee: session.fee,
    note: session.note,
  };

  if (session.schedule.mode === 'IN_PERSON') {
    const maxPatients = session.schedule.maxPatients ?? 0;
    const taken = new Set(
      booked.flatMap((b) => (b.serialNo ? [b.serialNo] : [])),
    );
    const nextSerial = lowestFreeSerial(taken, maxPatients);
    return {
      ...base,
      maxPatients,
      bookedCount: taken.size,
      nextSerial,
      slotMinutes: null,
      slots: [],
      bookable: nextSerial !== null && sessionOpen(session, now),
    };
  }

  const slotMinutes = session.schedule.slotMinutes ?? 15;
  const takenAt = new Set(booked.map((b) => b.scheduledAt.getTime()));
  const slots = slotTimes(session.startTime, session.endTime, slotMinutes).map(
    (time) => {
      const startsAt = dhakaWallTimeToUtc(session.date, time);
      return {
        time,
        startsAt: startsAt.toISOString(),
        available:
          !takenAt.has(startsAt.getTime()) && slotOpen(session.date, time, now),
      };
    },
  );
  return {
    ...base,
    maxPatients: null,
    bookedCount: null,
    nextSerial: null,
    slotMinutes,
    slots,
    bookable: slots.some((slot) => slot.available),
  };
}
