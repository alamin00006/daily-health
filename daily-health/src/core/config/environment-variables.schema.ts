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
/** Blank counts as not set. */
const optionalText = z
  .string()
  .optional()
  .transform((value) => value?.trim() || undefined);

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


/** Agora keys are 32 hex characters; an empty value (`AGORA_APP_ID=`) means "not set". */
const optionalAgoraKey = z
  .string()
  .transform((value) => value.trim() || undefined)
  .pipe(z.string().regex(/^[0-9a-f]{32}$/i, '32 hex characters').optional())
  .optional();

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

    /**
     * Where files live (CLAUDE.md §5). Both speak the S3 API; switching is these
     * variables plus copying the two buckets, no code change.
     */
    STORAGE_PROVIDER: z.enum(['R2', 'S3']).default('R2'),
    /** R2 only: the Cloudflare account id (builds the endpoint). */
    R2_ACCOUNT_ID: optionalText.pipe(
      z.string().regex(/^[0-9a-f]{32}$/i, '32 hex characters').optional(),
    ),
    /** S3 only: the bucket region, e.g. ap-southeast-1 (Singapore) or ap-south-1 (Mumbai). */
    S3_REGION: optionalText.pipe(z.string().regex(/^[a-z]{2}(-[a-z]+)+-\d$/, 'an AWS region').optional()),
    /** R2: API token with Object Read & Write on both buckets. S3: an IAM user's access key. */
    STORAGE_ACCESS_KEY_ID: z.string().min(16),
    STORAGE_SECRET_ACCESS_KEY: z.string().min(32),
    /** No dots in the names (virtual-hosted S3 URLs need them to match the TLS certificate). */
    STORAGE_PUBLIC_BUCKET: z.string().regex(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/, 'lowercase letters, digits, hyphens'),
    STORAGE_PRIVATE_BUCKET: z.string().regex(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/, 'lowercase letters, digits, hyphens'),
    /**
     * Optional endpoint override. Defaults: https://<account>.r2.cloudflarestorage.com (R2),
     * https://s3.<region>.amazonaws.com (S3). For an EU R2 bucket:
     * https://<account>.eu.r2.cloudflarestorage.com.
     */
    STORAGE_ENDPOINT: optionalText.pipe(z.url({ protocol: /^https?$/ }).optional()),
    /**
     * The public bucket's CDN domain, e.g. https://cdn.example.com: the R2 custom domain,
     * or a CloudFront distribution in front of the S3 bucket.
     */
    PUBLIC_FILES_BASE_URL: z.url({ protocol: /^https?$/ }),
    /** How long a presigned private file link works. */
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

    /**
     * Outgoing email (OTP codes, invites) through nodemailer's well-known service
     * (default Gmail): SMTP_USER is the address, SMTP_PASSWORD a Google app password.
     */
    SMTP_SERVICE: z.string().trim().min(1).default('gmail'),
    SMTP_USER: z.string().trim().min(3),
    SMTP_PASSWORD: z.string().trim().min(1),
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

    /**
     * Payment aggregator in use (bKash, Nagad, Rocket and cards come through it).
     * Switching is this one variable; both gateways are implemented.
     */
    /**
     * SMS through BulkSMSBD. With both the key and the sender ID set SMS go out; with
     * neither, nothing is sent and SMS notifications are stored as FAILED
     * (SMS_PROVIDER_NOT_CONFIGURED).
     */
    SMS_API_KEY_VALUE: z
      .string()
      .optional()
      .transform((value) => value?.trim() || undefined),
    SMS_SENDER_ID: z
      .string()
      .optional()
      .transform((value) => value?.trim() || undefined),
    /** Gateway host name only, no scheme or path. */
    SMS_API_HOST_SITE: z
      .string()
      .trim()
      .regex(/^[a-z0-9.-]+$/i, 'a host name such as bulksmsbd.net')
      .default('bulksmsbd.net'),

    PAYMENT_GATEWAY: z.enum(['SHURJOPAY', 'SSLCOMMERZ']).default('SHURJOPAY'),
    /**
     * Public base of this API as the gateways (and the phone's browser) reach
     * it, for return and IPN URLs: https://api.example.com/api/v1.
     */
    PAYMENT_CALLBACK_BASE_URL: z
      .url({ protocol: /^https?$/ })
      .default('http://localhost:3000/api/v1'),
    /** Where the return page sends the patient back: the app's deep link. */
    PAYMENT_APP_RETURN_URL: z.string().min(3).default('dailyhealth://payment-result'),
    /** Platform's share of each payment, in percent (the provider gets the rest). */
    PLATFORM_FEE_PERCENT: z.coerce.number().min(0).max(50).default(10),

    SHURJOPAY_BASE_URL: z
      .url({ protocol: /^https$/ })
      .default('https://sandbox.shurjopayment.com/api'),
    SHURJOPAY_USERNAME: z.string().optional(),
    SHURJOPAY_PASSWORD: z.string().optional(),
    /** Order-id prefix given by shurjoPay ("sp" in the sandbox). */
    SHURJOPAY_PREFIX: z.string().min(1).max(10).default('sp'),

    SSLCOMMERZ_BASE_URL: z
      .url({ protocol: /^https$/ })
      .default('https://sandbox.sslcommerz.com'),
    SSLCOMMERZ_STORE_ID: z.string().optional(),
    SSLCOMMERZ_STORE_PASSWORD: z.string().optional(),

    /** Agora video (console.agora.io → project). Without both, video calls answer VIDEO_NOT_CONFIGURED. */
    AGORA_APP_ID: optionalAgoraKey,
    /** Primary certificate of the same project; signs RTC tokens. Never sent to the apps. */
    AGORA_APP_CERTIFICATE: optionalAgoraKey,
    /** How long an RTC token works, in seconds (a call longer than this must rejoin). */
    AGORA_TOKEN_TTL_SECONDS: z.coerce.number().int().min(600).max(86_400).default(7200),
  })
  .superRefine((env, ctx) => {
    if (Boolean(env.SMS_API_KEY_VALUE) !== Boolean(env.SMS_SENDER_ID)) {
      ctx.addIssue({
        code: 'custom',
        path: ['SMS_SENDER_ID'],
        message: 'set both SMS_API_KEY_VALUE and SMS_SENDER_ID, or neither',
      });
    }
    const gatewayCredentials =
      env.PAYMENT_GATEWAY === 'SHURJOPAY'
        ? [env.SHURJOPAY_USERNAME, env.SHURJOPAY_PASSWORD]
        : [env.SSLCOMMERZ_STORE_ID, env.SSLCOMMERZ_STORE_PASSWORD];
    if (gatewayCredentials.some((value) => !value)) {
      ctx.addIssue({
        code: 'custom',
        path: ['PAYMENT_GATEWAY'],
        message: `credentials for ${env.PAYMENT_GATEWAY} are missing`,
      });
    }
    if (Boolean(env.AGORA_APP_ID) !== Boolean(env.AGORA_APP_CERTIFICATE)) {
      ctx.addIssue({
        code: 'custom',
        path: ['AGORA_APP_CERTIFICATE'],
        message: 'set both AGORA_APP_ID and AGORA_APP_CERTIFICATE, or neither',
      });
    }
    if (env.STORAGE_PROVIDER === 'R2' && !env.R2_ACCOUNT_ID && !env.STORAGE_ENDPOINT) {
      ctx.addIssue({
        code: 'custom',
        path: ['R2_ACCOUNT_ID'],
        message: 'required when STORAGE_PROVIDER=R2 (or set STORAGE_ENDPOINT)',
      });
    }
    if (env.STORAGE_PROVIDER === 'S3' && !env.S3_REGION) {
      ctx.addIssue({ code: 'custom', path: ['S3_REGION'], message: 'required when STORAGE_PROVIDER=S3' });
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
