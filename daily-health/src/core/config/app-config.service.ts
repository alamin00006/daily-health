import type {
  AppEnvironment,
  EnvironmentVariables,
} from './environment-variables.schema.js';

/**
 * Typed, validated app configuration. Inject this instead of reading
 * process.env anywhere else in the app.
 */
export class AppConfigService {
  constructor(private readonly env: EnvironmentVariables) {}

  get appEnv(): AppEnvironment {
    return this.env.APP_ENV;
  }

  get isProduction(): boolean {
    return this.env.APP_ENV === 'production';
  }

  get port(): number {
    return this.env.PORT;
  }

  get logLevel(): EnvironmentVariables['LOG_LEVEL'] {
    return this.env.LOG_LEVEL;
  }

  /** Swagger at /api/docs only in development and staging (CLAUDE.md §4). */
  get swaggerEnabled(): boolean {
    return this.env.APP_ENV === 'development' || this.env.APP_ENV === 'staging';
  }

  get corsOrigins(): readonly string[] {
    return this.env.CORS_ORIGINS;
  }

  get trustProxyHops(): number {
    return this.env.TRUST_PROXY_HOPS;
  }

  get databaseUrl(): string {
    return this.env.DATABASE_URL;
  }

  get redisUrl(): string {
    return this.env.REDIS_URL;
  }

  get encryption(): {
    keys: ReadonlyMap<number, Buffer>;
    activeKeyVersion: number;
  } {
    return {
      keys: this.env.ENCRYPTION_KEYS,
      activeKeyVersion: this.env.ENCRYPTION_ACTIVE_KEY_VERSION,
    };
  }

  get smtp(): {
    host: string;
    port: number;
    secure: boolean;
    auth: { user: string; pass: string } | undefined;
    from: string;
  } {
    const { SMTP_USER: user, SMTP_PASSWORD: pass } = this.env;
    return {
      host: this.env.SMTP_HOST,
      port: this.env.SMTP_PORT,
      secure: this.env.SMTP_SECURE,
      auth: user && pass ? { user, pass } : undefined,
      from: this.env.MAIL_FROM,
    };
  }

  get auth(): {
    jwtSecret: string;
    accessTokenTtlSeconds: number;
    refreshTokenTtlDays: number;
    otpHashSecret: string;
  } {
    return {
      jwtSecret: this.env.JWT_SECRET,
      accessTokenTtlSeconds: this.env.ACCESS_TOKEN_TTL_SECONDS,
      refreshTokenTtlDays: this.env.REFRESH_TOKEN_TTL_DAYS,
      otpHashSecret: this.env.OTP_HASH_SECRET,
    };
  }

  /** S3-compatible file storage: Cloudflare R2 or AWS S3 (STORAGE_PROVIDER). */
  get storage(): {
    provider: 'R2' | 'S3';
    /** SigV4 region: "auto" for R2. */
    region: string;
    endpoint: string;
    /** R2 wants <endpoint>/<bucket>/<key>; S3 wants <bucket>.<endpoint host>/<key>. */
    forcePathStyle: boolean;
    accessKeyId: string;
    secretAccessKey: string;
    publicBucket: string;
    privateBucket: string;
    publicBaseUrl: string;
    privateUrlTtlSeconds: number;
  } {
    const isR2 = this.env.STORAGE_PROVIDER === 'R2';
    // Presence of R2_ACCOUNT_ID / S3_REGION is checked at startup.
    const region = isR2 ? 'auto' : (this.env.S3_REGION ?? '');
    const defaultEndpoint = isR2
      ? `https://${this.env.R2_ACCOUNT_ID ?? ''}.r2.cloudflarestorage.com`
      : `https://s3.${region}.amazonaws.com`;
    return {
      provider: this.env.STORAGE_PROVIDER,
      region,
      endpoint: (this.env.STORAGE_ENDPOINT ?? defaultEndpoint).replace(/\/+$/, ''),
      forcePathStyle: isR2,
      accessKeyId: this.env.STORAGE_ACCESS_KEY_ID,
      secretAccessKey: this.env.STORAGE_SECRET_ACCESS_KEY,
      publicBucket: this.env.STORAGE_PUBLIC_BUCKET,
      privateBucket: this.env.STORAGE_PRIVATE_BUCKET,
      publicBaseUrl: this.env.PUBLIC_FILES_BASE_URL,
      privateUrlTtlSeconds: this.env.PRIVATE_FILE_URL_TTL_SECONDS,
    };
  }

  /** Base of the URL in a health card's QR code (no trailing slash). */
  get healthCardBaseUrl(): string {
    return this.env.HEALTH_CARD_BASE_URL.replace(/\/+$/, '');
  }

  /** Expo push API access token, if the Expo project requires one. */
  get expoPushAccessToken(): string | undefined {
    return this.env.EXPO_PUSH_ACCESS_TOKEN;
  }

  get payments(): {
    gateway: 'SHURJOPAY' | 'SSLCOMMERZ';
    callbackBaseUrl: string;
    appReturnUrl: string;
    platformFeePercent: number;
    shurjoPay: {
      baseUrl: string;
      username: string;
      password: string;
      prefix: string;
    };
    sslCommerz: { baseUrl: string; storeId: string; storePassword: string };
  } {
    return {
      gateway: this.env.PAYMENT_GATEWAY,
      callbackBaseUrl: this.env.PAYMENT_CALLBACK_BASE_URL.replace(/\/+$/, ''),
      appReturnUrl: this.env.PAYMENT_APP_RETURN_URL,
      platformFeePercent: this.env.PLATFORM_FEE_PERCENT,
      shurjoPay: {
        baseUrl: this.env.SHURJOPAY_BASE_URL.replace(/\/+$/, ''),
        username: this.env.SHURJOPAY_USERNAME ?? '',
        password: this.env.SHURJOPAY_PASSWORD ?? '',
        prefix: this.env.SHURJOPAY_PREFIX,
      },
      sslCommerz: {
        baseUrl: this.env.SSLCOMMERZ_BASE_URL.replace(/\/+$/, ''),
        storeId: this.env.SSLCOMMERZ_STORE_ID ?? '',
        storePassword: this.env.SSLCOMMERZ_STORE_PASSWORD ?? '',
      },
    };
  }

  /** null when Agora is not configured (video calls are then unavailable). */
  get agora(): { appId: string; appCertificate: string; tokenTtlSeconds: number } | null {
    if (!this.env.AGORA_APP_ID || !this.env.AGORA_APP_CERTIFICATE) return null;
    return {
      appId: this.env.AGORA_APP_ID,
      appCertificate: this.env.AGORA_APP_CERTIFICATE,
      tokenTtlSeconds: this.env.AGORA_TOKEN_TTL_SECONDS,
    };
  }
}
