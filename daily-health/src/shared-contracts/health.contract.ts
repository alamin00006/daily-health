import { z } from 'zod';
import {
  calendarDateSchema,
  paginationQuerySchema,
} from './common-fields.contract.js';
import { bloodGroupSchema, genderSchema } from './profiles.contract.js';

export const vitalTypeSchema = z.enum([
  'BP',
  'GLUCOSE',
  'WEIGHT',
  'PULSE',
  'TEMP',
  'SPO2',
]);
export type VitalType = z.infer<typeof vitalTypeSchema>;

/** When a glucose reading was taken. */
export const vitalContextSchema = z.enum(['FASTING', 'AFTER_MEAL', 'RANDOM']);
export type VitalContext = z.infer<typeof vitalContextSchema>;

/** Computed by the API from the reading; informational, not a diagnosis. */
export const vitalStatusSchema = z.enum([
  'NORMAL',
  'CONTROLLED',
  'HIGH',
  'LOW',
]);
export type VitalStatus = z.infer<typeof vitalStatusSchema>;

/** The unit the API stores and returns for each type (the app converts mg/dL itself). */
export const VITAL_UNITS = {
  BP: 'mmHg',
  GLUCOSE: 'mmol/L',
  WEIGHT: 'kg',
  PULSE: 'bpm',
  TEMP: '°C',
  SPO2: '%',
} as const satisfies Record<VitalType, string>;

/** Allowed clock skew for "measured in the future". */
const FUTURE_TOLERANCE_MS = 5 * 60_000;

const measuredAtSchema = z.iso.datetime({ offset: true }).refine(
  (value) => {
    const time = Date.parse(value);
    return (
      time >= Date.parse('2000-01-01T00:00:00Z') &&
      time <= Date.now() + FUTURE_TOLERANCE_MS
    );
  },
  { message: 'Measurement time must be between 2000 and now' },
);

const vitalCommonFields = {
  /** Defaults to now. ISO 8601 with offset, e.g. 2026-11-08T08:30:00+06:00. */
  measuredAt: measuredAtSchema.optional(),
  note: z.string().trim().min(1).max(500).optional(),
};

const decimalOne = (min: number, max: number) =>
  z.number().min(min).max(max).multipleOf(0.1);

// POST /api/v1/profiles/:profileId/vitals
export const createVitalRequestSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('BP'),
      systolic: z.number().int().min(50).max(260),
      diastolic: z.number().int().min(30).max(160),
      ...vitalCommonFields,
    })
    .refine((body) => body.systolic > body.diastolic, {
      message: 'Systolic must be higher than diastolic',
      path: ['diastolic'],
    }),
  z.object({
    type: z.literal('GLUCOSE'),
    /** mmol/L */
    value: decimalOne(1, 40),
    context: vitalContextSchema,
    ...vitalCommonFields,
  }),
  z.object({
    type: z.literal('WEIGHT'),
    /** kg */
    value: decimalOne(1, 300),
    ...vitalCommonFields,
  }),
  z.object({
    type: z.literal('PULSE'),
    /** beats per minute */
    value: z.number().int().min(20).max(250),
    ...vitalCommonFields,
  }),
  z.object({
    type: z.literal('TEMP'),
    /** °C */
    value: decimalOne(30, 45),
    ...vitalCommonFields,
  }),
  z.object({
    type: z.literal('SPO2'),
    /** % */
    value: z.number().int().min(50).max(100),
    ...vitalCommonFields,
  }),
]);
export type CreateVitalRequest = z.infer<typeof createVitalRequestSchema>;

// GET /api/v1/profiles/:profileId/vitals?type=BP&from=...&to=...&cursor=...&limit=...
export const listVitalsQuerySchema = paginationQuerySchema.extend({
  type: vitalTypeSchema.optional(),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
});
export type ListVitalsQuery = z.infer<typeof listVitalsQuerySchema>;

export interface VitalReadingResponse {
  id: string;
  type: VitalType;
  /** BP only. */
  systolic: number | null;
  diastolic: number | null;
  /** Every type except BP. */
  value: number | null;
  unit: string;
  context: VitalContext | null;
  /** null when it cannot be judged (WEIGHT without the profile's height). */
  status: VitalStatus | null;
  /** WEIGHT only, when the profile's height is known. */
  bmi: number | null;
  note: string | null;
  recordedByUserId: string;
  measuredAt: string;
  createdAt: string;
}

// GET /api/v1/profiles/:profileId/vitals/latest
export interface LatestVitalsResponse {
  /** The newest reading of each type that has one. */
  data: VitalReadingResponse[];
}

export const conditionKindSchema = z.enum(['CHRONIC', 'ALLERGY', 'SURGERY']);
export type ConditionKind = z.infer<typeof conditionKindSchema>;

const sinceSchema = calendarDateSchema.refine(
  (date) =>
    date >= '1900-01-01' && date <= new Date().toISOString().slice(0, 10),
  { message: 'Date must be between 1900-01-01 and today' },
);

const conditionFieldsSchema = z.object({
  /** e.g. "ডায়াবেটিস (টাইপ ২)", "পেনিসিলিন". */
  name: z.string().trim().min(1).max(120),
  kind: conditionKindSchema,
  since: sinceSchema.nullable().optional(),
  note: z.string().trim().min(1).max(1000).nullable().optional(),
});

// POST /api/v1/profiles/:profileId/conditions
export const createConditionRequestSchema = conditionFieldsSchema;
export type CreateConditionRequest = z.infer<
  typeof createConditionRequestSchema
>;

// PATCH /api/v1/profiles/:profileId/conditions/:conditionId
export const updateConditionRequestSchema = conditionFieldsSchema
  .partial()
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Send at least one field',
  });
export type UpdateConditionRequest = z.infer<
  typeof updateConditionRequestSchema
>;

// GET /api/v1/profiles/:profileId/conditions?kind=ALLERGY
export const listConditionsQuerySchema = z.object({
  kind: conditionKindSchema.optional(),
});

export interface MedicalConditionResponse {
  id: string;
  name: string;
  kind: ConditionKind;
  since: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

// POST /api/v1/profiles/:profileId/health-card
export const issueHealthCardRequestSchema = z.object({
  /** Days until the card stops working; omit for no expiry. */
  validForDays: z.number().int().min(1).max(3650).optional(),
});
export type IssueHealthCardRequest = z.infer<
  typeof issueHealthCardRequestSchema
>;

export interface HealthCardResponse {
  isActive: boolean;
  /** What the QR code encodes. */
  scanUrl: string;
  expiresAt: string | null;
  issuedAt: string;
}

// GET /api/v1/profiles/:profileId/health-card
export interface HealthCardStatusResponse {
  /** null until a card is issued. */
  card: HealthCardResponse | null;
}

// GET /api/v1/profiles/:profileId/health-card/accesses
export interface HealthCardAccessResponse {
  id: string;
  /** False for an anonymous scan. */
  byLoggedInUser: boolean;
  accessedAt: string;
}

// GET /api/v1/health-cards/:qrToken (public: whoever scans the card)
export interface HealthCardScanResponse {
  /** Readable patient ID (PR-2611-0042), e.g. for the hospital's own records. */
  patientCode: string;
  fullName: string;
  gender: z.infer<typeof genderSchema>;
  /** Whole years; null when the date of birth is unknown. */
  ageYears: number | null;
  bloodGroup: z.infer<typeof bloodGroupSchema> | null;
  chronicConditions: string[];
  allergies: string[];
  surgeries: string[];
}
