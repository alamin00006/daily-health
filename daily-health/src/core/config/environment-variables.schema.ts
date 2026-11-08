import { z } from 'zod';

export const APP_ENVIRONMENTS = [
  'development',
  'staging',
  'production',
] as const;
export type AppEnvironment = (typeof APP_ENVIRONMENTS)[number];

const LOG_LEVELS = [
  'fatal',
  'error',
  'warn',
  'info',
  'debug',
  'trace',
  'silent',
] as const;

/** AES-256 needs a 32-byte key. */
const ENCRYPTION_KEY_BYTES = 32;

const commaSeparatedList = z
  .string()
  .default('')
  .transform((raw) =>
    raw
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  );

/** Only the literal strings "true"/"false" (z.coerce.boolean turns "false" into true). */
const booleanString = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true');

/**
 * `ENCRYPTION_KEYS=1:<base64>,2:<base64>`: every key version that may still
 * appear as a ciphertext prefix. Old versions stay listed until re-encrypted.
 */
const encryptionKeysSchema = z
  .string()
  .min(1)
  .transform((raw, ctx) => {
    const keys = new Map<number, Buffer>();

    for (const entry of raw
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)) {
      const separator = entry.indexOf(':');
      const version = Number(entry.slice(0, separator));
      if (
        separator <= 0 ||
        !Number.isInteger(version) ||
        version < 1 ||
        version > 255
      ) {
        ctx.addIssue({
          code: 'custom',
          message: 'each entry must be "<version 1-255>:<base64 key>"',
        });
        return z.NEVER;
      }

      const key = Buffer.from(entry.slice(separator + 1), 'base64');
      if (key.length !== ENCRYPTION_KEY_BYTES) {
        ctx.addIssue({
          code: 'custom',
          message: `key version ${version} must be ${ENCRYPTION_KEY_BYTES} bytes, base64 encoded`,
        });
        return z.NEVER;
      }
      if (keys.has(version)) {
        ctx.addIssue({
          code: 'custom',
          message: `key version ${version} is listed twice`,
        });
        return z.NEVER;
      }
      keys.set(version, key);
    }

    if (keys.size === 0) {
      ctx.addIssue({ code: 'custom', message: 'at least one key is required' });
      return z.NEVER;
    }
    return keys;
  });

export const environmentVariablesSchema = z
  .object({
    APP_ENV: z.enum(APP_ENVIRONMENTS).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
    /** Browser origins allowed by CORS (the web panel). Mobile apps do not need CORS. */
    CORS_ORIGINS: commaSeparatedList.pipe(z.array(z.url())),
    /** Reverse proxies in front of the API (Nginx = 1), so req.ip is the client IP. */
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),

    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    REDIS_URL: z.url({ protocol: /^rediss?$/ }),

    ENCRYPTION_KEYS: encryptionKeysSchema,
    ENCRYPTION_ACTIVE_KEY_VERSION: z.coerce.number().int().min(1).max(255),

    STORAGE_ROOT_DIR: z.string().min(1).default('./storage'),
    PUBLIC_FILES_BASE_URL: z.url({ protocol: /^https?$/ }),
    PRIVATE_FILES_BASE_URL: z.url({ protocol: /^https?$/ }),
    /** Shared with Nginx `secure_link_md5`. */
    FILE_URL_SIGNING_SECRET: z.string().min(32),
    PRIVATE_FILE_URL_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(300)
      .max(900)
      .default(600),

    /**
     * Printed in the QR code of a health card as `<base>/<qrToken>`. Until the web
     * page exists it points at the public scan route, which returns JSON.
     */
    HEALTH_CARD_BASE_URL: z
      .url({ protocol: /^https?$/ })
      .default('http://localhost:3000/api/v1/health-cards'),

    /**
     * Expo push service (https://exp.host). The access token is optional: only
     * needed when "Enhanced push security" is turned on in the Expo project.
     */
    EXPO_PUSH_ACCESS_TOKEN: z
      .string()
      .optional()
      .transform((value) => value?.trim() || undefined),

    /** Outgoing email (OTP codes, invites) via SMTP / nodemailer. Mailpit locally. */
    SMTP_HOST: z.string().min(1),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535),
    /** true = TLS from the start (port 465); false = STARTTLS if offered (587/25/1025). */
    SMTP_SECURE: booleanString.default(false),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    /** e.g. "দৈনিক স্বাস্থ্য <no-reply@example.com>" */
    MAIL_FROM: z.string().min(3),

    /** HS256 secret for access tokens and short-lived verification tokens. */
    JWT_SECRET: z.string().min(32),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(60)
      .max(3600)
      .default(900),
    /** Sliding: every refresh extends the session by this much. */
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(60),
    /** HMAC key for stored OTP codes, so a DB leak does not reveal live codes. */
    OTP_HASH_SECRET: z.string().min(32),
  })
  .superRefine((env, ctx) => {
    if (Boolean(env.SMTP_USER) !== Boolean(env.SMTP_PASSWORD)) {
      ctx.addIssue({
        code: 'custom',
        path: ['SMTP_PASSWORD'],
        message: 'set both SMTP_USER and SMTP_PASSWORD, or neither',
      });
    }
    if (!env.ENCRYPTION_KEYS.has(env.ENCRYPTION_ACTIVE_KEY_VERSION)) {
      ctx.addIssue({
        code: 'custom',
        path: ['ENCRYPTION_ACTIVE_KEY_VERSION'],
        message: 'must be one of the versions in ENCRYPTION_KEYS',
      });
    }
  });

export type EnvironmentVariables = z.output<typeof environmentVariablesSchema>;

/**
 * Validates the environment once at startup and fails fast.
 * The error lists variable names and problems only, never values (secrets).
 */
export function parseEnvironmentVariables(
  source: NodeJS.ProcessEnv,
): EnvironmentVariables {
  const result = environmentVariablesSchema.safeParse(source);
  if (result.success) return result.data;

  const problems = result.error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
  throw new Error(`Invalid environment variables:\n${problems}`);
}
