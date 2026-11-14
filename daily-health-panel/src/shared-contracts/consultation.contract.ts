// Copied from the API (daily-health/src/shared-contracts) by scripts/copy-shared-contracts.mjs. Do not edit here.
import { z } from 'zod';
import { paginationQuerySchema } from './common-fields.contract';
import type { ProviderSummaryResponse } from './doctors.contract';
import type { PaymentStatus } from './payments.contract';

/**
 * Consultations: video/chat sessions of a booked appointment (STANDARD) and
 * pay-and-wait chat consults (QUICK). A quick consult is always chat only
 * (DB CHECK); its price is set by admins per kind and copied onto the
 * consultation when it is created, so a price change never touches existing ones.
 */
export const quickConsultKindSchema = z.enum(['GENERAL', 'WOMENS_HEALTH']);
export type QuickConsultKind = z.infer<typeof quickConsultKindSchema>;

export type ConsultChannel = 'VIDEO' | 'AUDIO' | 'CHAT';
export type ConsultTier = 'QUICK' | 'STANDARD';
export type ConsultStatus =
  /** Quick consult created, not paid yet. */
  | 'PENDING_PAYMENT'
  /** Paid; waiting in the queue for a doctor. */
  | 'WAITING'
  | 'ONGOING'
  | 'ENDED'
  /** No doctor took the quick consult in time (refunded). */
  | 'MISSED'
  | 'CANCELLED'
  /** Quick consult never paid. */
  | 'EXPIRED';

// ---------------------------------------------------------------------------
// Quick consult (patient side)
// ---------------------------------------------------------------------------

/** GET /api/v1/quick-consults/options */
export interface QuickConsultOptionResponse {
  kind: QuickConsultKind;
  price: number;
  isEnabled: boolean;
  /** How long the patient waits for a doctor before it is refunded. */
  maxWaitMin: number;
  /** How long the chat stays open after a doctor takes it. */
  sessionMin: number;
  /** Eligible doctors online now (female only for WOMENS_HEALTH). */
  doctorsOnline: number;
}

// POST /api/v1/profiles/:profileId/quick-consults
export const startQuickConsultRequestSchema = z.object({
  kind: quickConsultKindSchema,
  /** The question; becomes the first chat message (encrypted). */
  concern: z.string().trim().min(5).max(1000),
});
export type StartQuickConsultRequest = z.infer<typeof startQuickConsultRequestSchema>;

// ---------------------------------------------------------------------------
// Consultations (both sides)
// ---------------------------------------------------------------------------

export interface ConsultPatientInfo {
  id: string;
  /** "PR-2611-0042" */
  patientCode: string;
  fullName: string;
  gender: string | null;
  /** Whole years; null when the birth date is unknown. */
  ageYears: number | null;
}

export interface ConsultCallInfo {
  /** The provider has the call open now. */
  active: boolean;
  /** When the provider last rang the patient. */
  ringingAt: string | null;
}

export interface ConsultationResponse {
  id: string;
  tier: ConsultTier;
  channel: ConsultChannel;
  status: ConsultStatus;
  /** QUICK only. */
  quickKind: QuickConsultKind | null;
  appointmentId: string | null;
  /** "BK-2611-0042" for a booked consult. */
  appointmentCode: string | null;
  /** Booked consults: when it is due. */
  scheduledAt: string | null;
  patient: ConsultPatientInfo;
  /** null while a quick consult waits for a doctor. */
  provider: ProviderSummaryResponse | null;
  fee: number;
  /** null until the chat exists (booked video consults have none until started). */
  conversationId: string | null;
  /** Messages can still be sent. */
  chatOpen: boolean;
  /** WAITING: when it is refunded if no doctor takes it. */
  waitingUntil: string | null;
  /** ONGOING quick consult: when the chat closes by itself. */
  endsAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
  durationSec: number | null;
  call: ConsultCallInfo | null;
  /** QUICK: the payment state (null before a payment was started). */
  paymentStatus: PaymentStatus | null;
  createdAt: string;
}

// GET /api/v1/me/consultations
export const listMyConsultationsQuerySchema = paginationQuerySchema.extend({
  /** `active` = pending, waiting or ongoing. */
  state: z.enum(['active', 'past', 'all']).default('all'),
});
export type ListMyConsultationsQuery = z.infer<typeof listMyConsultationsQuerySchema>;

/** POST /consultations/:id/call/join (either side): an Agora RTC token. */
export interface CallJoinResponse {
  appId: string;
  /** Agora channel name. */
  channel: string;
  token: string;
  /** Numeric Agora uid of the caller in this channel. */
  uid: number;
  /** The other side's uid (to show their video). */
  remoteUid: number;
  /** Rejoin with a new token before this. */
  expiresAt: string;
}

// ---------------------------------------------------------------------------
// Provider panel
// ---------------------------------------------------------------------------

// POST /api/v1/provider/me/consultations — open the consult of a VIDEO or CHAT booking.
export const startBookedConsultRequestSchema = z.object({
  appointmentId: z.uuid(),
});
export type StartBookedConsultRequest = z.infer<typeof startBookedConsultRequestSchema>;

// GET /api/v1/provider/me/consultations
export const listProviderConsultationsQuerySchema = paginationQuerySchema.extend({
  state: z.enum(['active', 'past', 'all']).default('active'),
});
export type ListProviderConsultationsQuery = z.infer<typeof listProviderConsultationsQuerySchema>;

/** GET /api/v1/provider/me/quick-consults/queue — no health details before accepting. */
export interface QuickConsultQueueItemResponse {
  consultationId: string;
  kind: QuickConsultKind;
  patientGender: string | null;
  patientAgeYears: number | null;
  fee: number;
  waitingSince: string;
  waitingUntil: string;
}

// ---------------------------------------------------------------------------
// Admin: quick consult prices
// ---------------------------------------------------------------------------

export interface QuickConsultSettingResponse {
  kind: QuickConsultKind;
  price: number;
  isEnabled: boolean;
  maxWaitMin: number;
  sessionMin: number;
  updatedAt: string;
  /** Admin's name; null for the seeded default. */
  updatedByName: string | null;
}

// PUT /api/v1/admin/quick-consult-settings/:kind
export const updateQuickConsultSettingRequestSchema = z.object({
  /** Taka, up to 2 decimals. Applies to quick consults created after the change. */
  price: z.number().min(1).max(5000).multipleOf(0.01),
  isEnabled: z.boolean(),
  maxWaitMin: z.number().int().min(2).max(60),
  sessionMin: z.number().int().min(5).max(120),
});
export type UpdateQuickConsultSettingRequest = z.infer<typeof updateQuickConsultSettingRequestSchema>;

/** GET /api/v1/admin/quick-consult-settings/history */
export interface QuickConsultSettingChangeResponse {
  id: string;
  kind: QuickConsultKind;
  oldPrice: number;
  newPrice: number;
  oldEnabled: boolean;
  newEnabled: boolean;
  changedByName: string | null;
  changedAt: string;
}

export const listQuickConsultSettingHistoryQuerySchema = paginationQuerySchema;
export type ListQuickConsultSettingHistoryQuery = z.infer<typeof listQuickConsultSettingHistoryQuerySchema>;
