// API contracts shared with the mobile app and web panel.
// Pure zod, no Nest imports: this folder moves to packages/shared as is.
import { z } from 'zod';

/** Trimmed and lowercased, so "Amin@Mail.com " and "amin@mail.com" are one account. */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email());

/**
 * Bangladeshi mobile number, stored in E.164 (CLAUDE.md §4): +8801XXXXXXXXX,
 * operator digit 3–9. Accepts what people type ("01711-234567",
 * "8801711234567", "+880 1711 234567") and Bangla digits ("০১৭১১২৩৪৫৬৭").
 * Foreign numbers are refused until the owner decides otherwise.
 */
export const bangladeshPhoneSchema = z
  .string()
  .trim()
  .transform((raw) => {
    const digits = raw
      .replace(/[০-৯]/g, (digit) => String('০১২৩৪৫৬৭৮৯'.indexOf(digit)))
      .replace(/[\s()-]/g, '');
    const local = digits.replace(/^\+?880/, '');
    return local.startsWith('0') ? `+880${local.slice(1)}` : `+880${local}`;
  })
  .pipe(
    z
      .string()
      .regex(/^\+8801[3-9]\d{8}$/, 'Must be a Bangladeshi mobile number'),
  );

const TRIVIAL_PINS = new Set([
  '012345',
  '123456',
  '234567',
  '345678',
  '456789',
  '987654',
  '876543',
  '765432',
  '654321',
  '543210',
  '121212',
  '112233',
]);

/** 6-digit login PIN. All-same-digit and sequential PINs are refused. */
export const pinSchema = z
  .string()
  .regex(/^\d{6}$/, 'PIN must be exactly 6 digits')
  .refine((pin) => !/^(\d)\1{5}$/.test(pin) && !TRIVIAL_PINS.has(pin), {
    message: 'PIN is too easy to guess',
  });

export const otpCodeSchema = z
  .string()
  .regex(/^\d{6}$/, 'Code must be 6 digits');

export const devicePlatformSchema = z.enum(['ANDROID', 'IOS', 'WEB']);

/** Sent with every login, so sessions and push tokens are tied to one app install. */
export const deviceInfoSchema = z.object({
  /** Random id the app creates once per install (kept in expo-secure-store). */
  installationId: z
    .string()
    .min(8)
    .max(128)
    .regex(/^[A-Za-z0-9._-]+$/),
  platform: devicePlatformSchema,
  appVersion: z.string().trim().max(32).optional(),
  /** Expo push token, if notification permission was granted. */
  pushToken: z.string().trim().min(1).max(255).optional(),
});
export type DeviceInfo = z.infer<typeof deviceInfoSchema>;

/** Calendar date "YYYY-MM-DD" (Asia/Dhaka calendar, no time). */
export const calendarDateSchema = z.iso.date();

/** Query params of cursor-paginated lists: `?cursor=<meta.cursor>&limit=20`. */
export const paginationQuerySchema = z.object({
  cursor: z.string().min(1).max(512).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

/** Envelope for list responses (CLAUDE.md §4). */
export interface PaginatedResponse<T> {
  data: T[];
  meta: { cursor: string | null; hasMore: boolean };
}
