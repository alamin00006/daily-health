import { z } from 'zod';
import { bangladeshPhoneSchema, paginationQuerySchema } from './common-fields.contract.js';
import type { bloodGroupSchema, genderSchema } from './profiles.contract.js';

/**
 * আকস্মিক সেবা: a profile's emergency contacts, and the SOS button. Raising a
 * request alerts the family members who receive alerts (push + in-app + SMS)
 * and the emergency contacts marked `notifyOnSos` (SMS), and puts it in the
 * staff queue in the panel. One request per profile is open at a time.
 */
export const EMERGENCY_CONTACTS_MAX = 5;

/** Public helplines shown on the emergency screen (call from the phone). */
export const EMERGENCY_HELPLINES = [
  { number: '999', label: 'জাতীয় জরুরি সেবা (অ্যাম্বুলেন্স, পুলিশ, ফায়ার)' },
  { number: '16263', label: 'স্বাস্থ্য বাতায়ন (ডাক্তারের পরামর্শ)' },
] as const;

export const emergencyTypeSchema = z.enum(['SOS', 'AMBULANCE', 'DOCTOR_CALL']);
export type EmergencyType = z.infer<typeof emergencyTypeSchema>;

export const emergencyStatusSchema = z.enum(['OPEN', 'DISPATCHED', 'CLOSED', 'CANCELLED']);
export type EmergencyStatus = z.infer<typeof emergencyStatusSchema>;

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

export interface EmergencyContactResponse {
  id: string;
  name: string;
  /** E.164 */
  phone: string;
  relation: string | null;
  notifyOnSos: boolean;
}

// POST /api/v1/profiles/:profileId/emergency-contacts
export const createEmergencyContactRequestSchema = z.object({
  name: z.string().trim().min(2).max(80),
  phone: bangladeshPhoneSchema,
  relation: z.string().trim().max(40).nullable().optional(),
  notifyOnSos: z.boolean().default(true),
});
export type CreateEmergencyContactRequest = z.input<typeof createEmergencyContactRequestSchema>;

// PATCH /api/v1/profiles/:profileId/emergency-contacts/:contactId
export const updateEmergencyContactRequestSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    phone: bangladeshPhoneSchema,
    relation: z.string().trim().max(40).nullable(),
    notifyOnSos: z.boolean(),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, { message: 'Send at least one field' });
export type UpdateEmergencyContactRequest = z.input<typeof updateEmergencyContactRequestSchema>;

// ---------------------------------------------------------------------------
// Requests (the SOS button)
// ---------------------------------------------------------------------------

// POST /api/v1/profiles/:profileId/emergency-requests
export const createEmergencyRequestSchema = z
  .object({
    type: emergencyTypeSchema,
    /** From the phone's GPS when the user allowed it. */
    lat: z.number().min(-90).max(90).nullable().optional(),
    lng: z.number().min(-180).max(180).nullable().optional(),
    address: z.string().trim().max(300).nullable().optional(),
    note: z.string().trim().max(500).nullable().optional(),
  })
  .refine((b) => (b.lat == null) === (b.lng == null), {
    message: 'Send both lat and lng, or neither',
    path: ['lng'],
  });
export type CreateEmergencyRequest = z.input<typeof createEmergencyRequestSchema>;

// POST /api/v1/profiles/:profileId/emergency-requests/:requestId/location
// The phone's position when it arrived after the SOS was sent (GPS can be slow).
export const addEmergencyLocationRequestSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export type AddEmergencyLocationRequest = z.infer<typeof addEmergencyLocationRequestSchema>;

export interface EmergencyRequestResponse {
  id: string;
  /** "EM-2611-0007": what staff and family read out on the phone. */
  code: string;
  profileId: string;
  patientName: string;
  type: EmergencyType;
  status: EmergencyStatus;
  lat: number | null;
  lng: number | null;
  address: string | null;
  note: string | null;
  /** Staff note shown to the family ("অ্যাম্বুলেন্স রওনা হয়েছে"). */
  handlerNote: string | null;
  /** Family members alerted (push / in-app / SMS). */
  membersAlerted: number;
  contactsNotified: number;
  /** Contacts whose SMS could not be sent (call them yourself). */
  contactsFailed: number;
  createdAt: string;
  dispatchedAt: string | null;
  closedAt: string | null;
}

/** POST returns the new request, or the one already open (`alreadyOpen`). */
export interface RaiseEmergencyResponse {
  request: EmergencyRequestResponse;
  alreadyOpen: boolean;
}

// ---------------------------------------------------------------------------
// Staff (panel)
// ---------------------------------------------------------------------------

// GET /api/v1/staff/emergency-requests?state=active|closed
export const listEmergencyRequestsQuerySchema = paginationQuerySchema.extend({
  state: z.enum(['active', 'closed']).default('active'),
});
export type ListEmergencyRequestsQuery = z.infer<typeof listEmergencyRequestsQuerySchema>;

// POST /api/v1/staff/emergency-requests/:id/dispatch | /close
export const handleEmergencyRequestSchema = z.object({
  note: z.string().trim().max(500).nullable().optional(),
});
export type HandleEmergencyRequest = z.input<typeof handleEmergencyRequestSchema>;

export interface StaffEmergencyRequestResponse extends EmergencyRequestResponse {
  patientCode: string;
  gender: z.infer<typeof genderSchema>;
  /** Years; null when the date of birth is unknown. */
  age: number | null;
  bloodGroup: z.infer<typeof bloodGroupSchema> | null;
  /** Chronic conditions and allergies, as on the QR health card. */
  chronicConditions: string[];
  allergies: string[];
  requestedBy: { name: string | null; email: string | null };
  contacts: EmergencyContactResponse[];
  handledByName: string | null;
}

/** Realtime: `emergency:new` / `emergency:updated` to staff; `emergency:updated` to the family. */
export interface EmergencyRealtimeEvent {
  requestId: string;
  profileId: string;
  status: EmergencyStatus;
}
