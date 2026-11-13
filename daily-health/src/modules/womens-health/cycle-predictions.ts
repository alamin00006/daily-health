import { addDays } from '../../common/time/dhaka-time.js';
import type { CyclePhase } from '../../shared-contracts/womens-health.contract.js';

/** Cycle lengths outside this range are gaps in logging or typos, not cycles. */
const MIN_CYCLE_DAYS = 15;
const MAX_CYCLE_DAYS = 60;
const MAX_PERIOD_DAYS = 15;
/** Only recent cycles shape the average. */
const RECENT_CYCLES = 6;
/** The luteal phase is ~14 days for most people, so ovulation ≈ next start − 14. */
const LUTEAL_DAYS = 14;
/** Sperm survive ~5 days: fertile window = ovulation − 5 … ovulation + 1. */
const FERTILE_BEFORE = 5;
const FERTILE_AFTER = 1;

export interface PeriodDates {
  startDate: string;
  endDate: string | null;
}

export interface CycleStats {
  avgCycleDays: number;
  avgPeriodDays: number;
}

export interface CyclePrediction extends CycleStats {
  cycleDay: number | null;
  phase: CyclePhase;
  nextPeriodStart: string | null;
  nextPeriodEnd: string | null;
  ovulationDate: string | null;
  fertileStart: string | null;
  fertileEnd: string | null;
  daysUntilNextPeriod: number | null;
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** Length of each period (start → next start), in the order given (ascending). */
export function cycleLengths(periods: readonly PeriodDates[]): (number | null)[] {
  return periods.map((p, i) => {
    const next = periods[i + 1];
    return next ? daysBetween(p.startDate, next.startDate) : null;
  });
}

export function periodLength(p: PeriodDates): number | null {
  return p.endDate ? daysBetween(p.startDate, p.endDate) + 1 : null;
}

/**
 * Averages from the logged periods (ascending by start), falling back to the
 * user's own settings until there is data: one real cycle is enough to beat a
 * default, since the user can always correct it.
 */
export function cycleStats(periods: readonly PeriodDates[], fallback: CycleStats): CycleStats {
  const cycles = cycleLengths(periods)
    .filter((n): n is number => n !== null && n >= MIN_CYCLE_DAYS && n <= MAX_CYCLE_DAYS)
    .slice(-RECENT_CYCLES);
  const lengths = periods
    .map(periodLength)
    .filter((n): n is number => n !== null && n >= 1 && n <= MAX_PERIOD_DAYS)
    .slice(-RECENT_CYCLES);
  return {
    avgCycleDays: cycles.length ? Math.round(mean(cycles)) : fallback.avgCycleDays,
    avgPeriodDays: lengths.length ? Math.round(mean(lengths)) : fallback.avgPeriodDays,
  };
}

/** Where today falls and what comes next. `periods` ascending by start. */
export function predictCycle(periods: readonly PeriodDates[], fallback: CycleStats, today: string): CyclePrediction {
  const stats = cycleStats(periods, fallback);
  const last = periods.at(-1);
  if (!last) {
    return {
      ...stats,
      cycleDay: null,
      phase: 'UNKNOWN',
      nextPeriodStart: null,
      nextPeriodEnd: null,
      ovulationDate: null,
      fertileStart: null,
      fertileEnd: null,
      daysUntilNextPeriod: null,
    };
  }

  const cycleDay = daysBetween(last.startDate, today) + 1;
  const nextPeriodStart = addDays(last.startDate, stats.avgCycleDays);
  const ovulationDate = addDays(nextPeriodStart, -LUTEAL_DAYS);
  const fertileStart = addDays(ovulationDate, -FERTILE_BEFORE);
  const fertileEnd = addDays(ovulationDate, FERTILE_AFTER);
  // An open period counts as going on until its usual length has passed.
  const currentPeriodEnd = last.endDate ?? addDays(last.startDate, stats.avgPeriodDays - 1);

  let phase: CyclePhase;
  if (today <= currentPeriodEnd) phase = 'PERIOD';
  else if (today >= nextPeriodStart) phase = 'LATE';
  else if (today >= fertileStart && today <= fertileEnd) phase = 'FERTILE';
  else if (today < fertileStart) phase = 'FOLLICULAR';
  else phase = 'LUTEAL';

  return {
    ...stats,
    cycleDay,
    phase,
    nextPeriodStart,
    nextPeriodEnd: addDays(nextPeriodStart, stats.avgPeriodDays - 1),
    ovulationDate,
    fertileStart,
    fertileEnd,
    daysUntilNextPeriod: daysBetween(today, nextPeriodStart),
  };
}

/** Naegele's rule: due date = LMP + 280 days. */
export const PREGNANCY_DAYS = 280;

export function pregnancyProgress(lmpDate: string, today: string) {
  const elapsed = Math.max(0, daysBetween(lmpDate, today));
  const week = Math.floor(elapsed / 7);
  return {
    dueDate: addDays(lmpDate, PREGNANCY_DAYS),
    week,
    dayOfWeek: elapsed % 7,
    trimester: (week < 13 ? 1 : week < 27 ? 2 : 3) as 1 | 2 | 3,
    daysLeft: Math.max(0, PREGNANCY_DAYS - elapsed),
  };
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}
