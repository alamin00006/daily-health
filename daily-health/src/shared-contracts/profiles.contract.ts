import { z } from 'zod';
import { calendarDateSchema, emailSchema } from './common-fields.contract.js';

export const genderSchema = z.enum(['MALE', 'FEMALE', 'OTHER']);
export const bloodGroupSchema = z.enum([
  'A_POS',
  'A_NEG',
  'B_POS',
  'B_NEG',
  'AB_POS',
  'AB_NEG',
  'O_POS',
  'O_NEG',
]);
export const profileRoleSchema = z.enum(['OWNER', 'CAREGIVER', 'VIEWER']);
/** What the patient is to the member. SELF = the member is the patient. */
export const profileRelationSchema = z.enum([
  'SELF',
  'FATHER',
  'MOTHER',
  'CHILD',
  'SPOUSE',
  'OTHER',
]);
export type ProfileRole = z.infer<typeof profileRoleSchema>;
export type ProfileRelation = z.infer<typeof profileRelationSchema>;

export const dateOfBirthSchema = calendarDateSchema.refine(
  (date) =>
    date >= '1900-01-01' && date <= new Date().toISOString().slice(0, 10),
  { message: 'Date of birth must be between 1900-01-01 and today' },
);

const profileFieldsSchema = z.object({
  fullName: z.string().trim().min(1).max(100),
  gender: genderSchema,
  dateOfBirth: dateOfBirthSchema.nullable().optional(),
  bloodGroup: bloodGroupSchema.nullable().optional(),
  heightCm: z.number().min(30).max(250).multipleOf(0.1).nullable().optional(),
  district: z.string().trim().min(1).max(64).nullable().optional(),
});

// POST /api/v1/profiles
export const createProfileRequestSchema = profileFieldsSchema.extend({
  /** The creator's relation to the patient. SELF links the profile to the creator's account. */
  relation: profileRelationSchema,
});
export type CreateProfileRequest = z.infer<typeof createProfileRequestSchema>;

// PATCH /api/v1/profiles/:profileId
export const updateProfileRequestSchema = profileFieldsSchema
  .partial()
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Send at least one field',
  });
export type UpdateProfileRequest = z.infer<typeof updateProfileRequestSchema>;

export interface PatientProfileResponse {
  /** Internal; use in API paths, never show it to people. */
  id: string;
  /** What people see and read out: `PR-2611-0042` (see readable-id.contract.ts). */
  patientCode: string;
  fullName: string;
  gender: z.infer<typeof genderSchema>;
  dateOfBirth: string | null;
  bloodGroup: z.infer<typeof bloodGroupSchema> | null;
  heightCm: number | null;
  district: string | null;
  /** Square profile photo, 800px; signed, expires in about 10 minutes. */
  avatarUrl: string | null;
  /** The same photo at 200px, for lists. */
  avatarThumbnailUrl: string | null;
  /** True when the patient has their own account linked to this profile. */
  hasLinkedAccount: boolean;
  /** The caller's membership. */
  myRole: ProfileRole;
  myRelation: ProfileRelation;
  receivesAlerts: boolean;
  /**
   * When the "complete your profile" form was answered (POST …/health-intake). The app
   * keeps most features closed while the own (SELF) profile has none (Roadmap doc).
   */
  healthInfoCompletedAt: string | null;
  createdAt: string;
}

// PATCH /api/v1/profiles/:profileId/members/:userId
export const updateMemberRequestSchema = z
  .object({
    /** OWNER only. */
    role: profileRoleSchema.optional(),
    /** The member themself only. */
    relation: profileRelationSchema.exclude(['SELF']).optional(),
    /** The member themself only. */
    receivesAlerts: z.boolean().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Send at least one field',
  });
export type UpdateMemberRequest = z.infer<typeof updateMemberRequestSchema>;

export interface ProfileMemberResponse {
  userId: string;
  email: string | null;
  /** Name from the member's own profile, if they have one. */
  displayName: string | null;
  role: ProfileRole;
  relation: ProfileRelation;
  receivesAlerts: boolean;
  isPatient: boolean;
  joinedAt: string;
}

// POST /api/v1/profiles/:profileId/invites
export const createInviteRequestSchema = z.object({
  email: emailSchema,
  role: profileRoleSchema,
  /** What the patient is to the invitee. SELF = the invitee is the patient (links their account). */
  relation: profileRelationSchema,
});
export type CreateInviteRequest = z.infer<typeof createInviteRequestSchema>;

export interface ProfileInviteResponse {
  id: string;
  profileId: string;
  profileName: string;
  invitedEmail: string;
  role: ProfileRole;
  relation: ProfileRelation;
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'REVOKED' | 'EXPIRED';
  expiresAt: string;
  createdAt: string;
}

export interface MeResponse {
  id: string;
  email: string | null;
  role: string;
  isGuest: boolean;
  /** The caller's own profile (relation SELF), if created. */
  ownProfileId: string | null;
}
