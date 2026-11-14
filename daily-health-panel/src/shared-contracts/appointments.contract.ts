// Copied from the API (daily-health/src/shared-contracts) by scripts/copy-shared-contracts.mjs. Do not edit here.
import { z } from 'zod';
import {
  calendarDateSchema,
  paginationQuerySchema,
} from './common-fields.contract';
import {
  consultationModeSchema,
  type ChamberResponse,
  type ConsultationMode,
  type ProviderSummaryResponse,
} from './doctors.contract';
import { timeOfDaySchema } from './medicine.contract';

export const appointmentStatusSchema = z.enum([
  'PENDING_PAYMENT',
  'CONFIRMED',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
  'EXPIRED',
]);
export type AppointmentStatus = z.infer<typeof appointmentStatusSchema>;

export type AppointmentKind = 'NEW' | 'FOLLOW_UP';
export type AppointmentActor = 'PATIENT' | 'PROVIDER' | 'SYSTEM';

/** Minutes a new booking holds its slot while the patient pays. */
export const APPOINTMENT_HOLD_MINUTES = 10;
/** Bookings open this many days ahead. */
export const BOOKING_WINDOW_DAYS = 30;
/** A patient can cancel a confirmed booking until this many hours before. */
export const PATIENT_CANCEL_CUTOFF_HOURS = 2;

// ---------------------------------------------------------------------------
// Availability
// ---------------------------------------------------------------------------

// GET /api/v1/providers/:providerId/availability?from=2026-11-08&days=7&mode=IN_PERSON
export const availabilityQuerySchema = z.object({
  /** Defaults to today (Asia/Dhaka). */
  from: calendarDateSchema.optional(),
  days: z.coerce.number().int().min(1).max(14).default(7),
  mode: consultationModeSchema.optional(),
});
export type AvailabilityQuery = z.infer<typeof availabilityQuerySchema>;

export interface TimeSlotResponse {
  /** "18:30" Asia/Dhaka. */
  time: string;
  /** ISO instant. */
  startsAt: string;
  available: boolean;
}

/** One bookable session: a chamber evening (serials) or an online block (slots). */
export interface AvailabilitySessionResponse {
  scheduleId: string;
  mode: ConsultationMode;
  date: string;
  startTime: string;
  endTime: string;
  /** IN_PERSON only. */
  chamber: ChamberResponse | null;
  fee: number;
  /** IN_PERSON: serials. */
  maxPatients: number | null;
  bookedCount: number | null;
  /** The serial the next booking gets (null when full). */
  nextSerial: number | null;
  /** Time-slot modes. */
  slotMinutes: number | null;
  slots: TimeSlotResponse[];
  /** False when full, over, or the provider is off. */
  bookable: boolean;
  /** Day off / changed hours note from the provider. */
  note: string | null;
}

export interface AvailabilityDayResponse {
  date: string;
  /** 0 = Sunday. */
  weekday: number;
  /** The whole day is off. */
  isOff: boolean;
  offNote: string | null;
  sessions: AvailabilitySessionResponse[];
}

// ---------------------------------------------------------------------------
// Booking (patient side)
// ---------------------------------------------------------------------------

// POST /api/v1/profiles/:profileId/appointments
export const bookAppointmentRequestSchema = z
  .object({
    providerId: z.uuid(),
    scheduleId: z.uuid(),
    date: calendarDateSchema,
    /** Time-slot modes: the slot's start ("18:30"). Omit for IN_PERSON serials. */
    slotTime: timeOfDaySchema.optional(),
    /** Why they come; seen by the provider. */
    reason: z.string().trim().max(300).optional(),
    /** HOME_VISIT only. */
    homeAddress: z.string().trim().min(5).max(250).optional(),
    lat: z.number().min(20).max(27).optional(),
    lng: z.number().min(88).max(93).optional(),
    /** A follow-up of an earlier completed visit with the same provider. */
    parentAppointmentId: z.uuid().optional(),
  })
  .refine((body) => (body.lat === undefined) === (body.lng === undefined), {
    message: 'Send both lat and lng',
    path: ['lng'],
  });
export type BookAppointmentRequest = z.infer<
  typeof bookAppointmentRequestSchema
>;

// GET /api/v1/profiles/:profileId/appointments?scope=upcoming
export const listAppointmentsQuerySchema = paginationQuerySchema.extend({
  /** upcoming: waiting or confirmed, soonest first. past: everything else, newest first. */
  scope: z.enum(['upcoming', 'past']).default('upcoming'),
});
export type ListAppointmentsQuery = z.infer<typeof listAppointmentsQuerySchema>;

// POST /api/v1/profiles/:profileId/appointments/:appointmentId/cancel
export const cancelAppointmentRequestSchema = z.object({
  reason: z.string().trim().max(200).optional(),
});
export type CancelAppointmentRequest = z.infer<
  typeof cancelAppointmentRequestSchema
>;

// POST /api/v1/profiles/:profileId/appointments/:appointmentId/review
export const reviewAppointmentRequestSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(500).optional(),
});
export type ReviewAppointmentRequest = z.infer<
  typeof reviewAppointmentRequestSchema
>;

export interface AppointmentPaymentInfo {
  /** False for a free booking (confirmed at once). */
  required: boolean;
  amount: number;
  /** PENDING_PAYMENT: pay before this. */
  payBefore: string | null;
  /** Once paid: the receipt. */
  paymentId: string | null;
  /** "RC-2611-0042" */
  invoiceNo: string | null;
  /** BKASH, NAGAD, CARD… */
  method: string | null;
  paidAt: string | null;
  /** After a cancellation of a paid booking. */
  refund: { amount: number; status: 'REQUESTED' | 'PROCESSED' | 'FAILED' } | null;
}

export interface AppointmentResponse {
  id: string;
  /** "BK-2611-0042": shown at the chamber desk and in support. */
  code: string;
  patientId: string;
  patientName: string;
  patientCode: string;
  provider: ProviderSummaryResponse;
  chamber: ChamberResponse | null;
  mode: ConsultationMode;
  kind: AppointmentKind;
  parentAppointmentId: string | null;
  /** Asia/Dhaka date. */
  date: string;
  /** IN_PERSON: session start; else the slot start. */
  scheduledAt: string;
  sessionStartTime: string;
  sessionEndTime: string;
  durationMin: number;
  serialNo: number | null;
  /** IN_PERSON: rough time of this serial ("about 7:20 pm"). */
  estimatedAt: string | null;
  status: AppointmentStatus;
  reason: string | null;
  homeAddress: string | null;
  fee: number;
  payment: AppointmentPaymentInfo;
  cancelledBy: AppointmentActor | null;
  cancelReason: string | null;
  /** The patient may still cancel (status and cutoff). */
  canCancel: boolean;
  /** Completed and not reviewed yet. */
  canReview: boolean;
  myReview: { rating: number; comment: string | null } | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Follow-ups (in-app and external)
// ---------------------------------------------------------------------------

export const followUpModeSchema = z.enum(['IN_PERSON', 'VIDEO', 'HOME_VISIT']);
export type FollowUpMode = z.infer<typeof followUpModeSchema>;
export const followUpStatusSchema = z.enum([
  'UPCOMING',
  'DONE',
  'MISSED',
  'CANCELLED',
]);
export type FollowUpStatus = z.infer<typeof followUpStatusSchema>;

// POST /api/v1/profiles/:profileId/follow-ups (a doctor outside the app)
export const createFollowUpRequestSchema = z.object({
  doctorName: z.string().trim().min(2).max(80),
  location: z.string().trim().max(160).optional(),
  mode: followUpModeSchema.default('IN_PERSON'),
  /** ISO instant; reminded 24 h and 2 h before. */
  dueAt: z.iso.datetime({ offset: true }),
  note: z.string().trim().max(300).optional(),
});
export type CreateFollowUpRequest = z.infer<typeof createFollowUpRequestSchema>;

// PATCH /api/v1/profiles/:profileId/follow-ups/:followUpId
export const updateFollowUpRequestSchema = createFollowUpRequestSchema
  .extend({ status: z.enum(['UPCOMING', 'DONE', 'CANCELLED']) })
  .partial()
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Send at least one field',
  });
export type UpdateFollowUpRequest = z.infer<typeof updateFollowUpRequestSchema>;

// GET /api/v1/profiles/:profileId/follow-ups?scope=upcoming
export const listFollowUpsQuerySchema = paginationQuerySchema.extend({
  scope: z.enum(['upcoming', 'past']).default('upcoming'),
});
export type ListFollowUpsQuery = z.infer<typeof listFollowUpsQuerySchema>;

export interface FollowUpResponse {
  id: string;
  doctorName: string;
  location: string | null;
  mode: FollowUpMode;
  dueAt: string;
  status: FollowUpStatus;
  note: string | null;
  /** Set by a doctor in the app after a visit: book it with this provider. */
  appointmentId: string | null;
  providerId: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Provider side (web panel)
// ---------------------------------------------------------------------------

// GET /api/v1/provider/me/appointments?date=2026-11-08
export const providerDayQuerySchema = z.object({
  date: calendarDateSchema.optional(),
});
export type ProviderDayQuery = z.infer<typeof providerDayQuerySchema>;

// GET /api/v1/provider/me/appointments/calendar?from=2026-11-01&days=14
export const providerCalendarQuerySchema = z.object({
  from: calendarDateSchema.optional(),
  days: z.coerce.number().int().min(1).max(42).default(14),
});
export type ProviderCalendarQuery = z.infer<typeof providerCalendarQuerySchema>;

export interface ProviderCalendarDayResponse {
  date: string;
  confirmed: number;
  pendingPayment: number;
  completed: number;
}

export interface ProviderAppointmentPatient {
  id: string;
  patientCode: string;
  fullName: string;
  gender: 'MALE' | 'FEMALE' | 'OTHER';
  /** Years, or null without a birth date. */
  age: number | null;
  /** Earlier completed visits with this provider. */
  previousVisits: number;
}

export interface ProviderAppointmentResponse {
  id: string;
  code: string;
  patient: ProviderAppointmentPatient;
  mode: ConsultationMode;
  kind: AppointmentKind;
  chamber: ChamberResponse | null;
  date: string;
  scheduledAt: string;
  sessionStartTime: string;
  sessionEndTime: string;
  serialNo: number | null;
  estimatedAt: string | null;
  durationMin: number;
  status: AppointmentStatus;
  reason: string | null;
  homeAddress: string | null;
  fee: number;
  cancelledBy: AppointmentActor | null;
  cancelReason: string | null;
  /** The follow-up the provider set at completion. */
  followUpDueAt: string | null;
}

// POST /api/v1/provider/me/appointments/:appointmentId/complete
export const completeAppointmentRequestSchema = z.object({
  /** "Come back in 14 days": creates a follow-up reminder for the patient. */
  followUpInDays: z.number().int().min(1).max(365).optional(),
  followUpNote: z.string().trim().max(300).optional(),
});
export type CompleteAppointmentRequest = z.infer<
  typeof completeAppointmentRequestSchema
>;

// POST /api/v1/provider/me/appointments/:appointmentId/cancel
export const providerCancelAppointmentRequestSchema = z.object({
  reason: z.string().trim().min(3).max(200),
});
export type ProviderCancelAppointmentRequest = z.infer<
  typeof providerCancelAppointmentRequestSchema
>;
