import {
  addDays,
  dateColumnToString,
  dhakaDate,
  dhakaWallTimeToUtc,
  timeColumnToHhmm,
  weekdayOf,
} from '../../common/time/dhaka-time.js';

/** Every day of the week. */
export const ALL_DAYS_MASK = 0b1111111;

export interface ScheduleTime {
  id: string;
  /** `@db.Time` value. */
  timeOfDay: Date;
  dose: number;
  daysMask: number;
}

export interface SchedulePlan {
  id: string;
  /** `@db.Date` values. */
  startDate: Date;
  endDate: Date | null;
  createdAt: Date;
  times: ScheduleTime[];
}

export interface DoseSlot {
  planId: string;
  medicationTimeId: string;
  scheduledFor: Date;
  /** "08:00" (Asia/Dhaka). */
  time: string;
  dose: number;
}

export function maskFromDays(days?: number[]): number {
  if (!days || days.length === 0) return ALL_DAYS_MASK;
  return days.reduce((mask, day) => mask | (1 << day), 0);
}

export function daysFromMask(mask: number): number[] {
  return [0, 1, 2, 3, 4, 5, 6].filter((day) => (mask & (1 << day)) !== 0);
}

/**
 * The doses of one plan on one Asia/Dhaka day. Slots before the plan was
 * created are left out: a plan added at 3 pm does not owe the 8 am dose.
 */
export function slotsOnDate(plan: SchedulePlan, date: string): DoseSlot[] {
  const start = dateColumnToString(plan.startDate);
  const end = plan.endDate ? dateColumnToString(plan.endDate) : null;
  if (date < start || (end && date > end)) return [];

  const weekdayBit = 1 << weekdayOf(date);
  return plan.times
    .filter((time) => (time.daysMask & weekdayBit) !== 0)
    .map((time) => {
      const hhmm = timeColumnToHhmm(time.timeOfDay);
      return {
        planId: plan.id,
        medicationTimeId: time.id,
        scheduledFor: dhakaWallTimeToUtc(date, hhmm),
        time: hhmm,
        dose: time.dose,
      };
    })
    .filter((slot) => slot.scheduledFor >= plan.createdAt)
    .sort((a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime());
}

/** Slots of a plan with scheduledFor in [from, to]. */
export function slotsBetween(
  plan: SchedulePlan,
  from: Date,
  to: Date,
): DoseSlot[] {
  const slots: DoseSlot[] = [];
  const lastDate = dhakaDate(to);
  for (let date = dhakaDate(from); date <= lastDate; date = addDays(date, 1)) {
    for (const slot of slotsOnDate(plan, date)) {
      if (slot.scheduledFor >= from && slot.scheduledFor <= to)
        slots.push(slot);
    }
  }
  return slots;
}

/** Units per day on average, counting weekday-only times proportionally. */
export function averageDailyDose(times: ScheduleTime[]): number {
  return times.reduce(
    (sum, time) => sum + (time.dose * daysFromMask(time.daysMask).length) / 7,
    0,
  );
}

/** Whole days the stock lasts; null when stock is not tracked. */
export function stockDaysLeft(
  stockQty: number | null,
  times: ScheduleTime[],
): number | null {
  if (stockQty === null) return null;
  const perDay = averageDailyDose(times);
  if (perDay <= 0) return null;
  return Math.floor(stockQty / perDay);
}

/**
 * "1+0+½": morning (before 11:00), midday (before 17:00) and night doses, the
 * way Bangladeshi prescriptions write them. Falls back to listing every dose
 * when a part of the day has more than one time.
 */
export function dosePattern(times: ScheduleTime[]): string {
  const sorted = [...times].sort(
    (a, b) => a.timeOfDay.getTime() - b.timeOfDay.getTime(),
  );
  const buckets: number[][] = [[], [], []];
  for (const time of sorted) {
    const hhmm = timeColumnToHhmm(time.timeOfDay);
    const bucket = hhmm < '11:00' ? 0 : hhmm < '17:00' ? 1 : 2;
    buckets[bucket]!.push(time.dose);
  }
  if (buckets.every((bucket) => bucket.length <= 1)) {
    return buckets.map((bucket) => formatDoseAmount(bucket[0] ?? 0)).join('+');
  }
  return sorted.map((time) => formatDoseAmount(time.dose)).join('+');
}

const FRACTIONS: Record<string, string> = {
  '0.25': '¼',
  '0.5': '½',
  '0.75': '¾',
};

/** 0.5 → "½", 1.5 → "1½", 2 → "2". */
export function formatDoseAmount(dose: number): string {
  const whole = Math.floor(dose);
  const fraction = FRACTIONS[String(Math.round((dose - whole) * 100) / 100)];
  if (!fraction) return String(dose);
  return whole === 0 ? fraction : `${whole}${fraction}`;
}

/** Prisma plan (Decimal doses) → the plain shape the schedule functions use. */
export function toScheduleTimes(
  times: {
    id: string;
    timeOfDay: Date;
    dose: { toNumber(): number };
    daysMask: number;
  }[],
): ScheduleTime[] {
  return times.map((time) => ({
    id: time.id,
    timeOfDay: time.timeOfDay,
    dose: time.dose.toNumber(),
    daysMask: time.daysMask,
  }));
}

export function toSchedulePlan(plan: {
  id: string;
  startDate: Date;
  endDate: Date | null;
  createdAt: Date;
  times: Parameters<typeof toScheduleTimes>[0];
}): SchedulePlan {
  return {
    id: plan.id,
    startDate: plan.startDate,
    endDate: plan.endDate,
    createdAt: plan.createdAt,
    times: toScheduleTimes(plan.times),
  };
}
