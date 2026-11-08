// Copied from the API (daily-health/src/shared-contracts) until packages/shared exists. Do not edit here.
import { z } from 'zod';
import { timeOfDaySchema } from './medicine.contract';

// PATCH /api/v1/me/notification-preferences
export const updateNotificationPreferencesRequestSchema = z
  .object({
    pushEnabled: z.boolean(),
    smsEnabled: z.boolean(),
    /** Local dose alarms on this phone. */
    alarmEnabled: z.boolean(),
    /** Minutes after a dose time before family is alerted. */
    doseBackupDelayMin: z.number().int().min(10).max(240),
    /** Minutes before a follow-up or appointment, e.g. [1440, 120]. */
    followUpOffsetsMin: z.array(z.number().int().min(10).max(10_080)).min(1).max(4),
    /** Pushes between these Asia/Dhaka times arrive without sound; both or neither. */
    quietStart: timeOfDaySchema.nullable(),
    quietEnd: timeOfDaySchema.nullable(),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Send at least one field',
  })
  .refine(
    (body) =>
      body.quietStart === undefined ||
      body.quietEnd === undefined ||
      (body.quietStart === null) === (body.quietEnd === null),
    { message: 'Set both quiet times or neither', path: ['quietEnd'] }
  );
export type UpdateNotificationPreferencesRequest = z.infer<
  typeof updateNotificationPreferencesRequestSchema
>;

export interface NotificationPreferencesResponse {
  pushEnabled: boolean;
  smsEnabled: boolean;
  alarmEnabled: boolean;
  doseBackupDelayMin: number;
  followUpOffsetsMin: number[];
  quietStart: string | null;
  quietEnd: string | null;
}

// GET /api/v1/me/notifications?cursor=…&limit=…
export interface NotificationResponse {
  id: string;
  /** "dose.missed", "medicine.refill"… */
  type: string;
  title: string;
  body: string;
  /** Deep link, e.g. { screen: "medicine", profileId }. */
  data: Record<string, unknown> | null;
  patientId: string | null;
  readAt: string | null;
  createdAt: string;
}

// GET /api/v1/me/notifications/unread-count
export interface UnreadCountResponse {
  unread: number;
}
