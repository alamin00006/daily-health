// Copied from the API (daily-health/src/shared-contracts) by scripts/copy-shared-contracts.mjs. Do not edit here.
import { z } from 'zod';
import type { UserRole } from './auth.contract';
import { emailSchema, paginationQuerySchema } from './common-fields.contract';

/**
 * Admin panel: dashboard counts, the audit log of health-data access, user
 * accounts (suspend / reactivate) and staff (moderators and admins, with
 * their readable staff IDs `MR-2611-0001` / `AS-2611-0001`).
 */

// GET /api/v1/admin/dashboard
export interface AdminDashboardResponse {
  accounts: { total: number; newLast7Days: number };
  patientProfiles: number;
  providersPendingVerification: number;
  liveEmergencies: number;
  refundsWaiting: number;
  appointmentsToday: number;
  publishedHealthTips: number;
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

// GET /api/v1/admin/audit-logs?patientCode=&actorEmail=&action=
export const listAuditLogsQuerySchema = paginationQuerySchema.extend({
  patientCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^P[A-Z]-\d{4}-\d{4,}$/, 'Patient ID like PR-2611-0042')
    .optional(),
  actorEmail: emailSchema.optional(),
  /** Prefix, e.g. "prescription." or "womens-health". */
  action: z.string().trim().min(2).max(60).optional(),
});
export type ListAuditLogsQuery = z.infer<typeof listAuditLogsQuerySchema>;

export interface AuditLogResponse {
  id: string;
  action: string;
  entityType: string;
  patient: { patientCode: string; fullName: string } | null;
  /** null for an anonymous actor (health card scanned without logging in). */
  actor: { email: string | null; role: UserRole; name: string | null; code: string | null } | null;
  meta: Record<string, string | number | boolean | null> | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export const listAdminUsersQuerySchema = paginationQuerySchema.extend({
  /** Part of the email. */
  q: z.string().trim().min(2).max(100).optional(),
  role: z.enum(['PATIENT', 'DOCTOR', 'NUTRITIONIST', 'PHYSIO', 'MODERATOR', 'ADMIN']).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
});
export type ListAdminUsersQuery = z.infer<typeof listAdminUsersQuerySchema>;

export interface AdminUserResponse {
  id: string;
  email: string | null;
  role: UserRole;
  suspended: boolean;
  emailVerified: boolean;
  /** Own profile name, provider name or staff name. */
  name: string | null;
  /** The readable ID that goes with the role (PR-…, DF-…, AS-…). */
  code: string | null;
  createdAt: string;
  lastLoginAt: string | null;
}

// PATCH /api/v1/admin/users/:userId
export const updateAdminUserRequestSchema = z.object({ suspended: z.boolean() });
export type UpdateAdminUserRequest = z.infer<typeof updateAdminUserRequestSchema>;

// ---------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------

export const staffRoleSchema = z.enum(['MODERATOR', 'ADMIN']);
export type StaffRole = z.infer<typeof staffRoleSchema>;

export interface StaffMemberResponse {
  userId: string;
  staffCode: string;
  fullName: string;
  email: string | null;
  role: StaffRole;
  suspended: boolean;
  addedByName: string | null;
  createdAt: string;
}

// POST /api/v1/admin/staff — the person must already have an account (signed up with email OTP).
export const addStaffRequestSchema = z.object({
  email: emailSchema,
  fullName: z.string().trim().min(2).max(80),
  role: staffRoleSchema,
});
export type AddStaffRequest = z.infer<typeof addStaffRequestSchema>;

// PATCH /api/v1/admin/staff/:userId
export const updateStaffRequestSchema = z
  .object({ fullName: z.string().trim().min(2).max(80), role: staffRoleSchema })
  .partial()
  .refine((body) => Object.keys(body).length > 0, { message: 'Send at least one field' });
export type UpdateStaffRequest = z.infer<typeof updateStaffRequestSchema>;
