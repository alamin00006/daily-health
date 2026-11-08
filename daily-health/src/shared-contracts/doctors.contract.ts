import { z } from 'zod';
import {
  calendarDateSchema,
  paginationQuerySchema,
} from './common-fields.contract.js';
import { timeOfDaySchema, weekdaySchema } from './medicine.contract.js';

// ---------------------------------------------------------------------------
// Shared enums
// ---------------------------------------------------------------------------

export const providerTypeSchema = z.enum(['DOCTOR', 'NUTRITIONIST', 'PHYSIO']);
export type ProviderType = z.infer<typeof providerTypeSchema>;

export const providerGenderSchema = z.enum(['MALE', 'FEMALE']);
export type ProviderGender = z.infer<typeof providerGenderSchema>;

export const verificationStatusSchema = z.enum([
  'PENDING',
  'VERIFIED',
  'REJECTED',
]);
export type VerificationStatus = z.infer<typeof verificationStatusSchema>;

/** How the patient meets the provider. */
export const consultationModeSchema = z.enum([
  'IN_PERSON',
  'VIDEO',
  'CHAT',
  'HOME_VISIT',
]);
export type ConsultationMode = z.infer<typeof consultationModeSchema>;

export const verificationDocTypeSchema = z.enum([
  'BMDC_CERT',
  'NID',
  'DEGREE',
  'OTHER',
]);
export type VerificationDocType = z.infer<typeof verificationDocTypeSchema>;

/** Money in BDT, up to 2 decimals. */
export const feeSchema = z.number().min(0).max(100_000).multipleOf(0.01);

/**
 * BMDC registration number as printed ("A-12345" for MBBS, "D-1234" for
 * dental). Accepts "a12345", "A 12345", Bangla digits; stored as "A-12345".
 */
export const bmdcNumberSchema = z
  .string()
  .trim()
  .transform((raw) =>
    raw
      .replace(/[০-৯]/g, (digit) => String('০১২৩৪৫৬৭৮৯'.indexOf(digit)))
      .toUpperCase()
      .replace(/[\s-]/g, ''),
  )
  .pipe(z.string().regex(/^[AD]\d{2,6}$/, 'Like A-12345'))
  .transform((compact) => `${compact[0]}-${compact.slice(1)}`);

// ---------------------------------------------------------------------------
// Public: specialties, hospitals, search, detail
// ---------------------------------------------------------------------------

// GET /api/v1/specialties?type=DOCTOR
export const listSpecialtiesQuerySchema = z.object({
  type: providerTypeSchema.optional(),
});
export type ListSpecialtiesQuery = z.infer<typeof listSpecialtiesQuerySchema>;

export interface SpecialtyResponse {
  id: string;
  slug: string;
  nameBn: string;
  nameEn: string;
  /** Icon name in the apps (lucide). */
  iconName: string;
  forType: ProviderType;
  /** Verified providers with this specialty. */
  providerCount: number;
}

export interface HospitalResponse {
  id: string;
  name: string;
  address: string;
  district: string;
  lat: number | null;
  lng: number | null;
  phone: string | null;
}

// GET /api/v1/hospitals?q=ল্যাবএইড
export const searchHospitalsQuerySchema = z.object({
  q: z.string().trim().min(1).max(80),
});
export type SearchHospitalsQuery = z.infer<typeof searchHospitalsQuerySchema>;

// POST /api/v1/hospitals (a provider adds one that is not listed)
export const createHospitalRequestSchema = z.object({
  name: z.string().trim().min(2).max(120),
  address: z.string().trim().min(3).max(250),
  district: z.string().trim().min(2).max(40),
  phone: z.string().trim().max(20).optional(),
});
export type CreateHospitalRequest = z.infer<typeof createHospitalRequestSchema>;

const booleanQuery = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true');

// GET /api/v1/providers?type=DOCTOR&specialty=cardiology&q=রহমান&gender=FEMALE&mode=VIDEO&onlineNow=true
export const searchProvidersQuerySchema = paginationQuerySchema.extend({
  type: providerTypeSchema.default('DOCTOR'),
  /** Specialty slug. */
  specialty: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]{2,40}$/)
    .optional(),
  /** Name, Bangla or English; fuzzy (pg_trgm). */
  q: z.string().trim().min(1).max(80).optional(),
  gender: providerGenderSchema.optional(),
  /** Only providers offering this mode. */
  mode: consultationModeSchema.optional(),
  onlineNow: booleanQuery.optional(),
  /** Only providers with a chamber in this district. */
  district: z.string().trim().min(2).max(40).optional(),
});
export type SearchProvidersQuery = z.infer<typeof searchProvidersQuerySchema>;

export interface ProviderSpecialtyRef {
  id: string;
  slug: string;
  nameBn: string;
}

/** Fees per mode; null = not offered. */
export interface ProviderFees {
  /** Lowest chamber fee. */
  inPersonFrom: number | null;
  video: number | null;
  chat: number | null;
  homeVisit: number | null;
}

/** A row in search results and in "my doctors". */
export interface ProviderSummaryResponse {
  id: string;
  providerCode: string;
  type: ProviderType;
  gender: ProviderGender;
  displayName: string;
  designation: string | null;
  qualifications: string;
  /** Doctors only; shown as "BMDC: A-12345". */
  bmdcNo: string | null;
  experienceYears: number;
  avatarUrl: string | null;
  avatarThumbnailUrl: string | null;
  specialties: ProviderSpecialtyRef[];
  ratingAvg: number;
  ratingCount: number;
  isOnline: boolean;
  fees: ProviderFees;
  /** Modes with at least one active schedule. */
  modes: ConsultationMode[];
  /** Districts of the active chambers. */
  districts: string[];
}

export interface ChamberResponse {
  id: string;
  hospital: HospitalResponse;
  room: string | null;
  fee: number;
  followUpFee: number | null;
  isActive: boolean;
}

export interface ScheduleResponse {
  id: string;
  mode: ConsultationMode;
  /** null for online modes. */
  chamberId: string | null;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  slotMinutes: number | null;
  maxPatients: number | null;
  isActive: boolean;
}

export interface ReviewResponse {
  id: string;
  rating: number;
  comment: string | null;
  /** "রহিম উ." — first name and an initial only. */
  authorLabel: string;
  createdAt: string;
}

// GET /api/v1/providers/:providerId
export interface ProviderDetailResponse extends ProviderSummaryResponse {
  bio: string | null;
  acceptsQuickConsult: boolean;
  offersHomeVisit: boolean;
  chambers: ChamberResponse[];
  /** Active weekly schedules (bookable sessions come from …/availability). */
  schedules: ScheduleResponse[];
  /** Up to 3 newest visible reviews. */
  latestReviews: ReviewResponse[];
}

// GET /api/v1/providers/:providerId/reviews
export const listReviewsQuerySchema = paginationQuerySchema;

// ---------------------------------------------------------------------------
// "My doctors" (per patient profile)
// ---------------------------------------------------------------------------

// GET    /api/v1/profiles/:profileId/favorite-providers
// PUT    /api/v1/profiles/:profileId/favorite-providers/:providerId
// DELETE /api/v1/profiles/:profileId/favorite-providers/:providerId
export interface FavoriteProviderResponse {
  provider: ProviderSummaryResponse;
  addedAt: string;
}

// ---------------------------------------------------------------------------
// Provider's own profile (web panel)
// ---------------------------------------------------------------------------

const providerProfileFieldsSchema = z.object({
  gender: providerGenderSchema,
  /** Without "ডা."; the apps add the title. */
  displayName: z.string().trim().min(3).max(80),
  designation: z.string().trim().max(120).nullable().optional(),
  qualifications: z.string().trim().min(2).max(200),
  experienceYears: z.number().int().min(0).max(70),
  bio: z.string().trim().max(1500).nullable().optional(),
  specialtyIds: z.array(z.uuid()).min(1).max(5),
});

// POST /api/v1/provider/me
export const registerProviderRequestSchema = providerProfileFieldsSchema
  .extend({
    type: providerTypeSchema,
    bmdcNo: bmdcNumberSchema.optional(),
  })
  .refine((body) => (body.type === 'DOCTOR') === Boolean(body.bmdcNo), {
    message: 'Doctors need a BMDC number; others must not send one',
    path: ['bmdcNo'],
  });
export type RegisterProviderRequest = z.infer<
  typeof registerProviderRequestSchema
>;

// PATCH /api/v1/provider/me
export const updateProviderRequestSchema = providerProfileFieldsSchema
  .extend({
    /** Changing it sends a verified doctor back to PENDING. */
    bmdcNo: bmdcNumberSchema,
    videoFee: feeSchema.nullable(),
    chatFee: feeSchema.nullable(),
    homeVisitFee: feeSchema.nullable(),
    acceptsQuickConsult: z.boolean(),
    offersHomeVisit: z.boolean(),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Send at least one field',
  });
export type UpdateProviderRequest = z.infer<typeof updateProviderRequestSchema>;

// PUT /api/v1/provider/me/online
export const setOnlineRequestSchema = z.object({ isOnline: z.boolean() });
export type SetOnlineRequest = z.infer<typeof setOnlineRequestSchema>;

// POST /api/v1/provider/me/documents (multipart: file + docType)
export const uploadVerificationDocFieldsSchema = z.object({
  docType: verificationDocTypeSchema,
});
export type UploadVerificationDocFields = z.infer<
  typeof uploadVerificationDocFieldsSchema
>;

export interface VerificationDocumentResponse {
  id: string;
  docType: VerificationDocType;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  mimeType: string;
  /** Signed, expires (see urlsExpireAt). */
  url: string;
  thumbnailUrl: string | null;
  createdAt: string;
}

// GET /api/v1/provider/me
export interface MyProviderProfileResponse extends ProviderDetailResponse {
  verificationStatus: VerificationStatus;
  rejectionReason: string | null;
  verifiedAt: string | null;
  documents: VerificationDocumentResponse[];
  /** Inactive schedules and chambers too. */
  allChambers: ChamberResponse[];
  allSchedules: ScheduleResponse[];
  /** What is still missing before it can be submitted for verification. */
  missingForVerification: Array<'BMDC_CERT' | 'CHAMBER_OR_ONLINE_FEE'>;
  urlsExpireAt: string;
}

// POST /api/v1/provider/me/chambers   PATCH …/chambers/:chamberId
export const createChamberRequestSchema = z.object({
  hospitalId: z.uuid(),
  room: z.string().trim().max(60).nullable().optional(),
  fee: feeSchema,
  followUpFee: feeSchema.nullable().optional(),
});
export type CreateChamberRequest = z.infer<typeof createChamberRequestSchema>;

export const updateChamberRequestSchema = createChamberRequestSchema
  .omit({ hospitalId: true })
  .extend({ isActive: z.boolean() })
  .partial()
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Send at least one field',
  });
export type UpdateChamberRequest = z.infer<typeof updateChamberRequestSchema>;

const scheduleFieldsSchema = z.object({
  mode: consultationModeSchema,
  /** IN_PERSON only. */
  chamberId: z.uuid().nullable().optional(),
  days: z
    .array(weekdaySchema)
    .min(1)
    .max(7)
    .refine((days) => new Set(days).size === days.length, {
      message: 'Each day only once',
    }),
  startTime: timeOfDaySchema,
  endTime: timeOfDaySchema,
  /** VIDEO / CHAT / HOME_VISIT. */
  slotMinutes: z.number().int().min(5).max(120).nullable().optional(),
  /** IN_PERSON serial cap. */
  maxPatients: z.number().int().min(1).max(300).nullable().optional(),
});

function checkScheduleShape(
  body: z.infer<typeof scheduleFieldsSchema>,
  ctx: z.RefinementCtx,
): void {
  if (body.endTime <= body.startTime) {
    ctx.addIssue({
      code: 'custom',
      path: ['endTime'],
      message: 'Must end after it starts',
    });
  }
  if (body.mode === 'IN_PERSON') {
    if (!body.chamberId)
      ctx.addIssue({ code: 'custom', path: ['chamberId'], message: 'Required' });
    if (!body.maxPatients)
      ctx.addIssue({
        code: 'custom',
        path: ['maxPatients'],
        message: 'Required',
      });
  } else {
    if (!body.slotMinutes)
      ctx.addIssue({
        code: 'custom',
        path: ['slotMinutes'],
        message: 'Required',
      });
    if (body.chamberId)
      ctx.addIssue({
        code: 'custom',
        path: ['chamberId'],
        message: 'Online sessions have no chamber',
      });
  }
}

// POST /api/v1/provider/me/schedules — one row per selected day.
export const createScheduleRequestSchema =
  scheduleFieldsSchema.superRefine(checkScheduleShape);
export type CreateScheduleRequest = z.infer<typeof createScheduleRequestSchema>;

// PATCH /api/v1/provider/me/schedules/:scheduleId — hours, cap and on/off of one day.
export const updateScheduleRequestSchema = z
  .object({
    startTime: timeOfDaySchema,
    endTime: timeOfDaySchema,
    slotMinutes: z.number().int().min(5).max(120),
    maxPatients: z.number().int().min(1).max(300),
    isActive: z.boolean(),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Send at least one field',
  });
export type UpdateScheduleRequest = z.infer<typeof updateScheduleRequestSchema>;

// POST /api/v1/provider/me/schedule-exceptions
export const createScheduleExceptionRequestSchema = z
  .object({
    date: calendarDateSchema,
    /** Omit for the whole day (every schedule). */
    scheduleId: z.uuid().optional(),
    isOff: z.boolean().default(true),
    startTime: timeOfDaySchema.optional(),
    endTime: timeOfDaySchema.optional(),
    note: z.string().trim().max(120).optional(),
  })
  .superRefine((body, ctx) => {
    if (body.isOff) return;
    if (!body.scheduleId)
      ctx.addIssue({
        code: 'custom',
        path: ['scheduleId'],
        message: 'Changed hours need a schedule',
      });
    if (!body.startTime || !body.endTime || body.endTime <= body.startTime)
      ctx.addIssue({
        code: 'custom',
        path: ['endTime'],
        message: 'Give new start and end times',
      });
  });
export type CreateScheduleExceptionRequest = z.infer<
  typeof createScheduleExceptionRequestSchema
>;

export interface ScheduleExceptionResponse {
  id: string;
  date: string;
  scheduleId: string | null;
  isOff: boolean;
  startTime: string | null;
  endTime: string | null;
  note: string | null;
}

// GET /api/v1/provider/me/schedule-exceptions?from=2026-11-08
export const listScheduleExceptionsQuerySchema = z.object({
  from: calendarDateSchema.optional(),
});

// ---------------------------------------------------------------------------
// Admin: verification
// ---------------------------------------------------------------------------

// GET /api/v1/admin/providers?status=PENDING
export const listProvidersForReviewQuerySchema = paginationQuerySchema.extend({
  status: verificationStatusSchema.default('PENDING'),
});
export type ListProvidersForReviewQuery = z.infer<
  typeof listProvidersForReviewQuerySchema
>;

export interface ProviderForReviewResponse extends MyProviderProfileResponse {
  /** The account's email, for the admin to contact them. */
  accountEmail: string | null;
  submittedAt: string;
}

// POST /api/v1/admin/providers/:providerId/reject
export const rejectProviderRequestSchema = z.object({
  reason: z.string().trim().min(5).max(300),
});
export type RejectProviderRequest = z.infer<typeof rejectProviderRequestSchema>;
