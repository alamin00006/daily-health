import { z } from 'zod';
import { calendarDateSchema } from './common-fields.contract.js';

/**
 * Period tracker, daily symptoms and mood, and pregnancy tracking. Only the
 * patient themself (or the OWNER of a profile without its own account) can
 * read or write it; everything except dates needed for queries is encrypted.
 * Predictions are computed from the logged periods, never stored.
 */
export const cycleGoalSchema = z.enum(['TRACK', 'CONCEIVE', 'AVOID', 'PREGNANT']);
export type CycleGoal = z.infer<typeof cycleGoalSchema>;

export const flowSchema = z.enum(['NONE', 'SPOTTING', 'LIGHT', 'MEDIUM', 'HEAVY']);
export type Flow = z.infer<typeof flowSchema>;

export const moodSchema = z.enum(['HAPPY', 'CALM', 'SAD', 'IRRITABLE', 'ANXIOUS']);
export type Mood = z.infer<typeof moodSchema>;

export const symptomSchema = z.enum([
  'CRAMPS',
  'HEADACHE',
  'FATIGUE',
  'BLOATING',
  'BACKACHE',
  'ACNE',
  'BREAST_TENDERNESS',
  'NAUSEA',
  'CRAVINGS',
  'INSOMNIA',
]);
export type Symptom = z.infer<typeof symptomSchema>;

export type CyclePhase = 'PERIOD' | 'FOLLICULAR' | 'FERTILE' | 'LUTEAL' | 'LATE' | 'UNKNOWN';

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export interface CycleSettingsResponse {
  avgCycleDays: number;
  avgPeriodDays: number;
  goal: CycleGoal;
  /** The section asks for a PIN kept on the phone only. */
  appLockEnabled: boolean;
  /** Local reminders before the next period. */
  remindersOn: boolean;
}

// PUT /api/v1/profiles/:profileId/womens-health/settings
export const updateCycleSettingsRequestSchema = z
  .object({
    avgCycleDays: z.number().int().min(15).max(60),
    avgPeriodDays: z.number().int().min(1).max(15),
    goal: cycleGoalSchema,
    appLockEnabled: z.boolean(),
    remindersOn: z.boolean(),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, { message: 'Send at least one field' });
export type UpdateCycleSettingsRequest = z.infer<typeof updateCycleSettingsRequestSchema>;

// ---------------------------------------------------------------------------
// Periods
// ---------------------------------------------------------------------------

export interface PeriodResponse {
  id: string;
  startDate: string;
  /** null while it is going on. */
  endDate: string | null;
  /** Days to the next period's start (null for the latest). */
  cycleLengthDays: number | null;
  periodDays: number | null;
}

// POST /api/v1/profiles/:profileId/womens-health/periods
export const createPeriodRequestSchema = z
  .object({
    startDate: calendarDateSchema,
    endDate: calendarDateSchema.nullable().optional(),
  })
  .refine((b) => !b.endDate || b.endDate >= b.startDate, {
    message: 'End date must not be before the start',
    path: ['endDate'],
  });
export type CreatePeriodRequest = z.infer<typeof createPeriodRequestSchema>;

// PATCH /api/v1/profiles/:profileId/womens-health/periods/:periodId
export const updatePeriodRequestSchema = z
  .object({
    startDate: calendarDateSchema,
    endDate: calendarDateSchema.nullable(),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, { message: 'Send at least one field' });
export type UpdatePeriodRequest = z.infer<typeof updatePeriodRequestSchema>;

// ---------------------------------------------------------------------------
// Daily log
// ---------------------------------------------------------------------------

export interface DailyLogResponse {
  date: string;
  flow: Flow | null;
  mood: Mood | null;
  symptoms: Symptom[];
  note: string | null;
}

// PUT /api/v1/profiles/:profileId/womens-health/logs/:date
export const saveDailyLogRequestSchema = z.object({
  flow: flowSchema.nullable(),
  mood: moodSchema.nullable(),
  symptoms: z.array(symptomSchema).max(10),
  note: z.string().trim().max(500).nullable(),
});
export type SaveDailyLogRequest = z.infer<typeof saveDailyLogRequestSchema>;

// GET /api/v1/profiles/:profileId/womens-health/logs?from=&to=
export const listDailyLogsQuerySchema = z
  .object({ from: calendarDateSchema, to: calendarDateSchema })
  .refine((q) => q.to >= q.from, { message: '`to` must not be before `from`', path: ['to'] });
export type ListDailyLogsQuery = z.infer<typeof listDailyLogsQuerySchema>;

// ---------------------------------------------------------------------------
// Pregnancy
// ---------------------------------------------------------------------------

export interface PregnancyResponse {
  id: string;
  /** First day of the last period. */
  lmpDate: string;
  /** LMP + 280 days. */
  dueDate: string;
  /** Completed weeks and days today. */
  week: number;
  dayOfWeek: number;
  /** 1, 2 or 3. */
  trimester: 1 | 2 | 3;
  daysLeft: number;
  status: 'ACTIVE' | 'ENDED';
}

// POST /api/v1/profiles/:profileId/womens-health/pregnancy
export const startPregnancyRequestSchema = z.object({ lmpDate: calendarDateSchema });
export type StartPregnancyRequest = z.infer<typeof startPregnancyRequestSchema>;

// ---------------------------------------------------------------------------
// Overview (the section's home)
// ---------------------------------------------------------------------------

export interface CycleOverviewResponse {
  settings: CycleSettingsResponse;
  /** Averages actually used (from the logged periods when there are enough). */
  avgCycleDays: number;
  avgPeriodDays: number;
  lastPeriod: PeriodResponse | null;
  /** Day of the current cycle (1 = first day of the last period); null without data. */
  cycleDay: number | null;
  phase: CyclePhase;
  nextPeriodStart: string | null;
  nextPeriodEnd: string | null;
  ovulationDate: string | null;
  fertileStart: string | null;
  fertileEnd: string | null;
  /** Negative when late. */
  daysUntilNextPeriod: number | null;
  today: DailyLogResponse | null;
  pregnancy: PregnancyResponse | null;
}
