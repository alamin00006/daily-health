import { addDays, weekdayOf } from '../../common/time/dhaka-time.js';
import type { ConsultationMode } from '../../shared-contracts/doctors.contract.js';

/** A weekly schedule with times as "HH:MM" (Asia/Dhaka). */
export interface CalendarSchedule {
  id: string;
  mode: ConsultationMode;
  chamberId: string | null;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  slotMinutes: number | null;
  maxPatients: number | null;
}

export interface CalendarException {
  /** null = the whole day, every schedule. */
  scheduleId: string | null;
  date: string;
  isOff: boolean;
  startTime: string | null;
  endTime: string | null;
  note: string | null;
}

/** One session on one date, after days off and changed hours are applied. */
export interface CalendarSession {
  date: string;
  schedule: CalendarSchedule;
  startTime: string;
  endTime: string;
  note: string | null;
}

export interface CalendarDay {
  date: string;
  weekday: number;
  isOff: boolean;
  offNote: string | null;
  sessions: CalendarSession[];
}

/**
 * Which sessions run on which dates: the weekly schedules, minus whole days
 * off and per-schedule days off, with changed hours applied. Pure, so the
 * appointments module can add booking counts and time-based rules on top.
 */
export function buildCalendar(
  schedules: CalendarSchedule[],
  exceptions: CalendarException[],
  from: string,
  days: number,
): CalendarDay[] {
  const result: CalendarDay[] = [];
  for (let offset = 0; offset < days; offset += 1) {
    const date = addDays(from, offset);
    const weekday = weekdayOf(date);
    const dayExceptions = exceptions.filter((e) => e.date === date);
    const wholeDayOff = dayExceptions.find(
      (e) => e.scheduleId === null && e.isOff,
    );
    const sessions: CalendarSession[] = [];
    if (!wholeDayOff) {
      for (const schedule of schedules) {
        if (schedule.dayOfWeek !== weekday) continue;
        const exception = dayExceptions.find(
          (e) => e.scheduleId === schedule.id,
        );
        if (exception?.isOff) continue;
        sessions.push({
          date,
          schedule,
          startTime: exception?.startTime ?? schedule.startTime,
          endTime: exception?.endTime ?? schedule.endTime,
          note: exception?.note ?? null,
        });
      }
      sessions.sort((a, b) => a.startTime.localeCompare(b.startTime));
    }
    result.push({
      date,
      weekday,
      isOff: Boolean(wholeDayOff),
      offNote: wholeDayOff?.note ?? null,
      sessions,
    });
  }
  return result;
}

/** "18:00"–"20:00" every 15 min → ["18:00", "18:15", …, "19:45"]. */
export function slotTimes(
  startTime: string,
  endTime: string,
  slotMinutes: number,
): string[] {
  const start = toMinutes(startTime);
  const end = toMinutes(endTime);
  const times: string[] = [];
  for (let at = start; at + slotMinutes <= end; at += slotMinutes) {
    times.push(fromMinutes(at));
  }
  return times;
}

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  return h * 60 + m;
}

export function fromMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** True when [aStart, aEnd) and [bStart, bEnd) overlap ("HH:MM"). */
export function timesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}
