// Copied from the API (daily-health/src/shared-contracts) until packages/shared exists. Do not edit here.
import { z } from 'zod';
import { calendarDateSchema, paginationQuerySchema } from './common-fields.contract';

export const medicineFormSchema = z.enum([
  'TABLET',
  'CAPSULE',
  'SYRUP',
  'SUSPENSION',
  'DROPS',
  'INJECTION',
  'INSULIN',
  'INHALER',
  'CREAM',
  'OINTMENT',
  'GEL',
  'SUPPOSITORY',
  'POWDER',
  'OTHER',
]);
export type MedicineForm = z.infer<typeof medicineFormSchema>;

/** What one dose is counted in. The app shows each in Bangla (ট্যাবলেট, চামচ…). */
export const doseUnitSchema = z.enum([
  'TABLET',
  'CAPSULE',
  'ML',
  'SPOON',
  'DROP',
  'PUFF',
  'UNIT',
  'SACHET',
  'APPLICATION',
]);
export type DoseUnit = z.infer<typeof doseUnitSchema>;

export const mealTimingSchema = z.enum(['BEFORE_MEAL', 'AFTER_MEAL', 'WITH_MEAL', 'ANY']);
export type MealTiming = z.infer<typeof mealTimingSchema>;

export const doseStatusSchema = z.enum(['PENDING', 'TAKEN', 'MISSED', 'SKIPPED', 'SNOOZED']);
export type DoseStatus = z.infer<typeof doseStatusSchema>;

/** "08:00", "21:30": Asia/Dhaka wall-clock time, 24-hour. */
export const timeOfDaySchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM (24-hour)');

/** 0 = Sunday … 6 = Saturday. */
export const weekdaySchema = z.number().int().min(0).max(6);

/** ½, ¼ and whole doses: 0.25 … 20. */
export const doseAmountSchema = z.number().min(0.25).max(20).multipleOf(0.25);

const medicationTimeInputSchema = z.object({
  time: timeOfDaySchema,
  dose: doseAmountSchema,
  /** Omit for every day. */
  days: z
    .array(weekdaySchema)
    .min(1)
    .max(7)
    .refine((days) => new Set(days).size === days.length, {
      message: 'Each day only once',
    })
    .optional(),
});
export type MedicationTimeInput = z.infer<typeof medicationTimeInputSchema>;

const timesSchema = z
  .array(medicationTimeInputSchema)
  .min(1)
  .max(8)
  .refine((times) => new Set(times.map((t) => t.time)).size === times.length, {
    message: 'Each time only once',
  });

const planFieldsSchema = z.object({
  /** From the catalog search; omit for a medicine that is not listed. */
  medicineId: z.uuid().optional(),
  /** "Sergel 20mg": shown in alarms. The app fills it from the catalog. */
  displayName: z.string().trim().min(1).max(80),
  doseUnit: doseUnitSchema,
  mealTiming: mealTimingSchema.default('ANY'),
  /** Minutes before/after the meal, e.g. 30. */
  mealOffsetMin: z.number().int().min(0).max(240).nullable().optional(),
  /** Defaults to today (Asia/Dhaka). */
  startDate: calendarDateSchema.optional(),
  /** Last day of a course (e.g. antibiotics); omit or null for ongoing. */
  endDate: calendarDateSchema.nullable().optional(),
  times: timesSchema,
  /** Units in hand; omit to not track stock. */
  stockQty: z.number().min(0).max(10_000).multipleOf(0.25).nullable().optional(),
  /** Refill alert when this many days of stock are left. */
  refillAlertDays: z.number().int().min(0).max(60).default(5),
});

// POST /api/v1/profiles/:profileId/medication-plans
export const createMedicationPlanRequestSchema = planFieldsSchema.refine(
  (plan) => !plan.endDate || !plan.startDate || plan.endDate >= plan.startDate,
  { message: 'End date must not be before the start date', path: ['endDate'] }
);
export type CreateMedicationPlanRequest = z.infer<typeof createMedicationPlanRequestSchema>;

// PATCH /api/v1/profiles/:profileId/medication-plans/:planId
export const updateMedicationPlanRequestSchema = planFieldsSchema
  .omit({ medicineId: true, startDate: true })
  .partial()
  .extend({
    // .partial() would keep these defaults and send them on every edit.
    mealTiming: mealTimingSchema.optional(),
    refillAlertDays: z.number().int().min(0).max(60).optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Send at least one field',
  });
export type UpdateMedicationPlanRequest = z.infer<typeof updateMedicationPlanRequestSchema>;

// POST /api/v1/profiles/:profileId/medication-plans/:planId/restock
export const restockRequestSchema = z.object({
  /** Units bought, added to the current stock. */
  quantity: z.number().min(0.25).max(10_000).multipleOf(0.25),
});
export type RestockRequest = z.infer<typeof restockRequestSchema>;

// GET /api/v1/profiles/:profileId/medication-plans?includeStopped=true
export const listMedicationPlansQuerySchema = z.object({
  includeStopped: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});

export interface MedicationTimeResponse {
  id: string;
  time: string;
  dose: number;
  /** 0 = Sunday … 6 = Saturday. */
  days: number[];
}

export interface MedicationPlanResponse {
  id: string;
  medicineId: string | null;
  prescriptionItemId: string | null;
  displayName: string;
  genericName: string | null;
  doseUnit: DoseUnit;
  mealTiming: MealTiming;
  mealOffsetMin: number | null;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
  times: MedicationTimeResponse[];
  /** "1+0+½" style summary, morning to night. */
  pattern: string;
  stockQty: number | null;
  /** Whole days the stock lasts at the current schedule; null when not tracked. */
  stockDaysLeft: number | null;
  /** stockDaysLeft ≤ refillAlertDays. */
  lowStock: boolean;
  refillAlertDays: number;
  createdAt: string;
}

// POST /api/v1/profiles/:profileId/doses
// Identified by plan + scheduled time, so a dose marked while offline can be sent later.
export const recordDoseRequestSchema = z
  .object({
    planId: z.uuid(),
    /** The slot's time, exactly as returned by GET …/doses. */
    scheduledFor: z.iso.datetime({ offset: true }),
    /** PENDING undoes an earlier choice. */
    status: z.enum(['TAKEN', 'SKIPPED', 'SNOOZED', 'PENDING']),
    /** SNOOZED only: remind again after this many minutes. */
    snoozeMinutes: z.number().int().min(5).max(120).optional(),
    /** When it happened, if marked later (offline). Defaults to now. */
    actedAt: z.iso.datetime({ offset: true }).optional(),
  })
  .refine((body) => body.status !== 'SNOOZED' || body.snoozeMinutes, {
    message: 'snoozeMinutes is required to snooze',
    path: ['snoozeMinutes'],
  });
export type RecordDoseRequest = z.infer<typeof recordDoseRequestSchema>;

// GET /api/v1/profiles/:profileId/doses?date=2026-11-08
export const daySchedulesQuerySchema = z.object({
  /** Asia/Dhaka calendar day; defaults to today. */
  date: calendarDateSchema.optional(),
});

/**
 * What the app shows on a dose row:
 * UPCOMING (later today), DUE (time has come), SNOOZED, TAKEN, SKIPPED, MISSED.
 */
export type DoseState = 'UPCOMING' | 'DUE' | 'SNOOZED' | 'TAKEN' | 'SKIPPED' | 'MISSED';

export interface DoseSlotResponse {
  /** null until the dose is recorded or scheduled by the server. */
  doseLogId: string | null;
  planId: string;
  medicationTimeId: string | null;
  displayName: string;
  doseUnit: DoseUnit;
  dose: number;
  mealTiming: MealTiming;
  mealOffsetMin: number | null;
  scheduledFor: string;
  /** "08:00" in Asia/Dhaka. */
  time: string;
  status: DoseStatus;
  state: DoseState;
  actedAt: string | null;
  actedByUserId: string | null;
  snoozedUntil: string | null;
}

export interface DayScheduleResponse {
  date: string;
  doses: DoseSlotResponse[];
  summary: {
    total: number;
    taken: number;
    skipped: number;
    missed: number;
    /** Not acted on yet (upcoming, due or snoozed). */
    remaining: number;
  };
}

// GET /api/v1/profiles/:profileId/medicine/adherence?days=7
export const adherenceQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(7),
});

export interface AdherenceResponse {
  from: string;
  to: string;
  /** Doses whose time has passed in the period. */
  scheduled: number;
  taken: number;
  /** Taken within an hour of the time. */
  takenOnTime: number;
  skipped: number;
  missed: number;
  /** taken / scheduled × 100, rounded; null when nothing was scheduled. */
  percent: number | null;
  daily: { date: string; scheduled: number; taken: number }[];
}

// GET /api/v1/medicines?q=napa&limit=10
export const searchMedicinesQuerySchema = paginationQuerySchema.omit({ cursor: true }).extend({
  q: z.string().trim().min(2).max(60),
  limit: z.coerce.number().int().min(1).max(30).default(10),
});
export type SearchMedicinesQuery = z.infer<typeof searchMedicinesQuerySchema>;

export interface MedicineResponse {
  id: string;
  brandName: string;
  genericName: string;
  strength: string;
  form: MedicineForm;
  manufacturer: string | null;
  unitPrice: number | null;
  /** Suggested plan name, e.g. "Sergel 20 mg". */
  displayName: string;
  /** Suggested dose unit for the form. */
  suggestedDoseUnit: DoseUnit;
}
