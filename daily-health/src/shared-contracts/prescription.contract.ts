import { z } from 'zod';
import {
  calendarDateSchema,
  paginationQuerySchema,
} from './common-fields.contract.js';
import type { ProviderSummaryResponse } from './doctors.contract.js';
import {
  doseUnitSchema,
  mealTimingSchema,
  medicineFormSchema,
  type DoseUnit,
  type MealTiming,
  type MedicineForm,
} from './medicine.contract.js';

/**
 * Digital prescriptions. A doctor writes one for a booked visit or a
 * consultation (DRAFT), then issues it; issued ones never change (a mistake
 * is revoked with a reason and written again). Each medicine line has a dose
 * pattern such as `1+0+½` that the patient turns into a medicine alarm in one tap.
 */
export type PrescriptionStatus = 'DRAFT' | 'ISSUED' | 'REVOKED';

// ---------------------------------------------------------------------------
// Dose patterns ("1+0+1", "½+0+½", "১+০+১", "1+1+1+1")
// ---------------------------------------------------------------------------

const BANGLA_DIGITS = '০১২৩৪৫৬৭৮৯';
const FRACTIONS: Record<string, number> = { '½': 0.5, '¼': 0.25, '¾': 0.75 };

/** One part of a pattern: "1", "0", "½", "1½", "2", "0.5". null if not a dose. */
function parseDosePart(raw: string): number | null {
  const text = raw
    .trim()
    .replace(/[০-৯]/g, (d) => String(BANGLA_DIGITS.indexOf(d)));
  if (/^\d+(\.\d+)?$/.test(text)) return Number(text);
  const mixed = /^(\d*)([½¼¾])$/.exec(text);
  if (mixed) return Number(mixed[1] || 0) + FRACTIONS[mixed[2]!]!;
  return null;
}

/**
 * The dose at each time of day, morning first: "1+0+½" → [1, 0, 0.5].
 * 1 to 4 parts, each 0 or a multiple of ¼ up to 20, at least one above 0.
 * Returns null for anything else.
 */
export function parseDosePattern(pattern: string): number[] | null {
  const parts = pattern.split(/\s*[+\-–]\s*/);
  if (parts.length < 1 || parts.length > 4) return null;
  const doses = parts.map(parseDosePart);
  if (doses.some((d) => d === null || d > 20 || (d * 4) % 1 !== 0)) return null;
  const values = doses as number[];
  return values.some((d) => d > 0) ? values : null;
}

/** Usual times (Asia/Dhaka) for 1–4 doses a day; the patient can change them later. */
export const DEFAULT_DOSE_TIMES: Record<number, readonly string[]> = {
  1: ['08:00'],
  2: ['08:00', '21:00'],
  3: ['08:00', '14:00', '21:00'],
  4: ['08:00', '13:00', '18:00', '22:00'],
};

/** "1+0+½" → [{ time: '08:00', dose: 1 }, { time: '21:00', dose: 0.5 }] (zero doses dropped). */
export function doseTimesFromPattern(pattern: string): { time: string; dose: number }[] | null {
  const doses = parseDosePattern(pattern);
  if (!doses) return null;
  const times = DEFAULT_DOSE_TIMES[doses.length]!;
  return doses.flatMap((dose, i) => (dose > 0 ? [{ time: times[i]!, dose }] : []));
}

export const dosePatternSchema = z
  .string()
  .trim()
  .min(1)
  .max(20)
  .refine((value) => parseDosePattern(value) !== null, {
    message: 'Use a pattern like 1+0+1 or 1+0+½',
  });

// ---------------------------------------------------------------------------
// Writing (provider panel)
// ---------------------------------------------------------------------------

export const prescriptionItemInputSchema = z.object({
  /** From the medicine catalog; omit for a medicine that is not listed. */
  medicineId: z.uuid().optional(),
  /** "Napa", shown on the prescription and in the alarm. */
  medicineName: z.string().trim().min(1).max(80),
  /** "500 mg" */
  strength: z.string().trim().max(40).optional(),
  form: medicineFormSchema,
  /** What one dose is counted in (ট্যাবলেট, চামচ…). */
  doseUnit: doseUnitSchema,
  dosePattern: dosePatternSchema,
  mealTiming: mealTimingSchema.default('AFTER_MEAL'),
  /** Days to take it; null = continue (long-term medicine). */
  durationDays: z.number().int().min(1).max(365).nullable(),
  /** "ব্যথা হলে খাবেন", "ঘুমানোর আগে" */
  instruction: z.string().trim().max(300).optional(),
});
export type PrescriptionItemInput = z.infer<typeof prescriptionItemInputSchema>;

export const prescribedTestInputSchema = z.object({
  /** "CBC", "Lipid profile" */
  testName: z.string().trim().min(2).max(80),
  note: z.string().trim().max(300).optional(),
});
export type PrescribedTestInput = z.infer<typeof prescribedTestInputSchema>;

// POST /api/v1/provider/me/prescriptions — a draft for a visit or a consultation (returns the open one if any).
export const startPrescriptionRequestSchema = z
  .object({
    appointmentId: z.uuid().optional(),
    consultationId: z.uuid().optional(),
  })
  .refine((body) => Boolean(body.appointmentId) !== Boolean(body.consultationId), {
    message: 'Send either appointmentId or consultationId',
  });
export type StartPrescriptionRequest = z.infer<typeof startPrescriptionRequestSchema>;

// PUT /api/v1/provider/me/prescriptions/:id — replaces the whole draft.
export const savePrescriptionDraftRequestSchema = z.object({
  /** রোগীর সমস্যা */
  chiefComplaint: z.string().trim().max(1000).optional(),
  /** রোগ নির্ণয় */
  diagnosis: z.string().trim().max(1000).optional(),
  /** উপদেশ */
  advice: z.string().trim().max(2000).optional(),
  /** "১৪ দিন পর আসবেন" */
  followUpAfterDays: z.number().int().min(1).max(365).nullable().optional(),
  items: z.array(prescriptionItemInputSchema).max(20),
  tests: z.array(prescribedTestInputSchema).max(20),
});
export type SavePrescriptionDraftRequest = z.infer<typeof savePrescriptionDraftRequestSchema>;

// POST /api/v1/provider/me/prescriptions/:id/revoke
export const revokePrescriptionRequestSchema = z.object({
  reason: z.string().trim().min(3).max(300),
});
export type RevokePrescriptionRequest = z.infer<typeof revokePrescriptionRequestSchema>;

// GET /api/v1/provider/me/prescriptions
export const listProviderPrescriptionsQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['DRAFT', 'ISSUED', 'REVOKED']).optional(),
});
export type ListProviderPrescriptionsQuery = z.infer<typeof listProviderPrescriptionsQuerySchema>;

// ---------------------------------------------------------------------------
// Reading (both sides)
// ---------------------------------------------------------------------------

export interface PrescriptionItemResponse {
  id: string;
  medicineId: string | null;
  medicineName: string;
  strength: string | null;
  form: MedicineForm;
  doseUnit: DoseUnit;
  dosePattern: string;
  /** The pattern parsed, morning first: [1, 0, 0.5]. */
  doses: number[];
  mealTiming: MealTiming;
  durationDays: number | null;
  instruction: string | null;
  /** Patient side: the medicine alarm made from this line, if any. */
  alarm: { planId: string; isActive: boolean } | null;
}

export interface PrescribedTestResponse {
  id: string;
  testName: string;
  note: string | null;
  /** The uploaded report, once the patient links it. */
  resultFile: { id: string; title: string } | null;
}

export interface PrescriptionPatientInfo {
  id: string;
  patientCode: string;
  fullName: string;
  gender: string | null;
  ageYears: number | null;
}

export interface PrescriptionResponse {
  id: string;
  /** "RX-2611-0042" */
  code: string;
  status: PrescriptionStatus;
  patient: PrescriptionPatientInfo;
  provider: ProviderSummaryResponse | null;
  appointmentId: string | null;
  /** "BK-2611-0042" */
  appointmentCode: string | null;
  consultationId: string | null;
  chiefComplaint: string | null;
  diagnosis: string | null;
  advice: string | null;
  followUpAfterDays: number | null;
  items: PrescriptionItemResponse[];
  tests: PrescribedTestResponse[];
  issuedAt: string | null;
  revokedAt: string | null;
  revokeReason: string | null;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Patient side
// ---------------------------------------------------------------------------

// GET /api/v1/profiles/:profileId/prescriptions — issued and revoked, newest first.
export const listPrescriptionsQuerySchema = paginationQuerySchema;
export type ListPrescriptionsQuery = z.infer<typeof listPrescriptionsQuerySchema>;

// POST /api/v1/profiles/:profileId/prescriptions/:id/items/:itemId/alarm
export const createAlarmFromItemRequestSchema = z.object({
  /** Defaults to today (Asia/Dhaka). */
  startDate: calendarDateSchema.optional(),
});
export type CreateAlarmFromItemRequest = z.infer<typeof createAlarmFromItemRequestSchema>;

// PUT /api/v1/profiles/:profileId/prescriptions/:id/tests/:testId/result
export const linkTestResultRequestSchema = z.object({
  /** A report already uploaded to this profile; null to unlink. */
  fileId: z.uuid().nullable(),
});
export type LinkTestResultRequest = z.infer<typeof linkTestResultRequestSchema>;
