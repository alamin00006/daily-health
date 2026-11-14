// Copied from the API (daily-health/src/shared-contracts) by scripts/copy-shared-contracts.mjs. Do not edit here.
import { z } from 'zod';
import { calendarDateSchema, paginationQuerySchema } from './common-fields.contract';
import type { ProviderSummaryResponse } from './doctors.contract';

/**
 * Nutritionist & diet chart (CLAUDE.md §1, feature 8). A nutritionist is booked
 * through a normal Appointment; after the visit they write a DietPlan for it (panel
 * or the app's provider area): four meals a day, calorie and water targets. The
 * patient's family checks meals off and logs water each day.
 */

export const mealTypeSchema = z.enum(['BREAKFAST', 'LUNCH', 'SNACKS', 'DINNER']);
export type MealType = z.infer<typeof mealTypeSchema>;

export const dietPlanStatusSchema = z.enum(['DRAFT', 'ACTIVE', 'ENDED']);
export type DietPlanStatus = z.infer<typeof dietPlanStatusSchema>;

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM (24-hour)');

export interface DietMealResponse {
  id: string;
  mealType: MealType;
  /** "08:00", Asia/Dhaka. */
  time: string;
  description: string;
  approxKcal: number | null;
  sortOrder: number;
}

export interface DietPlanResponse {
  id: string;
  patientId: string;
  provider: Pick<ProviderSummaryResponse, 'id' | 'type' | 'displayName' | 'designation' | 'avatarThumbnailUrl'> | null;
  appointmentId: string;
  /** "BK-2611-0042" */
  appointmentCode: string | null;
  title: string;
  calorieTargetKcal: number;
  waterTargetMl: number;
  startDate: string;
  endDate: string | null;
  status: DietPlanStatus;
  notes: string | null;
  meals: DietMealResponse[];
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Provider view: also whose plan it is. */
export interface ProviderDietPlanResponse extends DietPlanResponse {
  patientName: string | null;
  patientCode: string | null;
}

// ---------------------------------------------------------------------------
// Provider side
// ---------------------------------------------------------------------------

export const dietMealInputSchema = z.object({
  mealType: mealTypeSchema,
  time: hhmm,
  description: z.string().trim().min(2).max(1000),
  approxKcal: z.coerce.number().int().min(0).max(5000).nullable().default(null),
});
export type DietMealInput = z.infer<typeof dietMealInputSchema>;

const planFields = z.object({
  title: z.string().trim().min(2).max(120),
  calorieTargetKcal: z.coerce.number().int().min(500).max(6000),
  waterTargetMl: z.coerce.number().int().min(500).max(8000),
  startDate: calendarDateSchema,
  endDate: calendarDateSchema.nullable().default(null),
  notes: z.string().trim().max(3000).nullable().default(null),
  /** At least one meal; up to six (four main meals plus extra snacks). */
  meals: z.array(dietMealInputSchema).min(1).max(6),
});
const checkDates = (v: { startDate?: string; endDate?: string | null }) =>
  !v.startDate || !v.endDate || v.endDate >= v.startDate;

// POST /api/v1/provider/me/diet-plans
export const createDietPlanRequestSchema = planFields
  .extend({ appointmentId: z.uuid() })
  .refine(checkDates, { path: ['endDate'], message: 'End date is before the start date' });
export type CreateDietPlanRequest = z.infer<typeof createDietPlanRequestSchema>;

// PUT /api/v1/provider/me/diet-plans/:planId   (whole plan; DRAFT or ACTIVE)
export const updateDietPlanRequestSchema = planFields.refine(checkDates, {
  path: ['endDate'],
  message: 'End date is before the start date',
});
export type UpdateDietPlanRequest = z.infer<typeof updateDietPlanRequestSchema>;

export const listProviderDietPlansQuerySchema = paginationQuerySchema.extend({
  status: dietPlanStatusSchema.optional(),
});
export type ListProviderDietPlansQuery = z.infer<typeof listProviderDietPlansQuerySchema>;

/** A visit the provider can write a plan for. */
export interface DietPlanCandidateResponse {
  appointmentId: string;
  appointmentCode: string;
  scheduledAt: string;
  patientId: string;
  patientName: string | null;
  patientCode: string | null;
  /** A plan already written for this visit. */
  existingPlanId: string | null;
}

// ---------------------------------------------------------------------------
// Patient side
// ---------------------------------------------------------------------------

export interface DietMealDayResponse extends DietMealResponse {
  followed: boolean;
}

// GET /api/v1/profiles/:profileId/diet/days/:date
export interface DietDayResponse {
  date: string;
  /** The plan in effect that day, or null. */
  plan: Omit<DietPlanResponse, 'meals'> | null;
  meals: DietMealDayResponse[];
  /** From the meals checked as followed. */
  caloriesKcal: number;
  waterMl: number;
}

// PUT /api/v1/profiles/:profileId/diet/days/:date/meals/:mealId
export const setMealFollowedRequestSchema = z.object({ followed: z.boolean() });
export type SetMealFollowedRequest = z.infer<typeof setMealFollowedRequestSchema>;

// PUT /api/v1/profiles/:profileId/diet/days/:date/water
export const setWaterRequestSchema = z.object({
  waterMl: z.coerce.number().int().min(0).max(10_000),
});
export type SetWaterRequest = z.infer<typeof setWaterRequestSchema>;
