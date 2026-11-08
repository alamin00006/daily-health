/**
 * Asia/Dhaka helpers. Bangladesh is UTC+6 all year (no daylight saving), so a
 * fixed offset is exact. Times are stored in UTC and shown in Dhaka time
 * (CLAUDE.md §4); `Schedule` and `MedicationTime` times are Dhaka wall clock.
 */
const DHAKA_OFFSET_MS = 6 * 60 * 60_000;
const DAY_MS = 24 * 60 * 60_000;

/** "2026-11-08": the Dhaka calendar day of an instant. */
export function dhakaDate(instant: Date = new Date()): string {
  return new Date(instant.getTime() + DHAKA_OFFSET_MS)
    .toISOString()
    .slice(0, 10);
}

/** "08:30": the Dhaka wall-clock time of an instant. */
export function dhakaTimeOfDay(instant: Date): string {
  return new Date(instant.getTime() + DHAKA_OFFSET_MS)
    .toISOString()
    .slice(11, 16);
}

/** The instant of a Dhaka wall-clock time on a Dhaka day. */
export function dhakaWallTimeToUtc(date: string, time: string): Date {
  return new Date(Date.parse(`${date}T${time}:00.000Z`) - DHAKA_OFFSET_MS);
}

/** Midnight at the start of a Dhaka day, as an instant. */
export function dhakaStartOfDay(date: string): Date {
  return dhakaWallTimeToUtc(date, '00:00');
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00.000Z`).getUTCDay();
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00.000Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/** Prisma maps `@db.Time` to a Date on 1970-01-01 (UTC parts = the stored time). */
export function timeColumnToHhmm(value: Date): string {
  return value.toISOString().slice(11, 16);
}

export function hhmmToTimeColumn(time: string): Date {
  return new Date(`1970-01-01T${time}:00.000Z`);
}

/** `@db.Date` columns come back as UTC midnight. */
export function dateColumnToString(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function stringToDateColumn(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

/**
 * True when a Dhaka time falls in a window that may wrap past midnight
 * ("22:00"–"07:00").
 */
export function isWithinDailyWindow(
  time: string,
  start: string,
  end: string,
): boolean {
  if (start === end) return false;
  return start < end
    ? time >= start && time < end
    : time >= start || time < end;
}
