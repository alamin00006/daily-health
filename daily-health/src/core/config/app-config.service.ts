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

  get storage(): {
    rootDir: string;
    publicBaseUrl: string;
    privateBaseUrl: string;
    urlSigningSecret: string;
    privateUrlTtlSeconds: number;
  } {
    return {
      rootDir: this.env.STORAGE_ROOT_DIR,
      publicBaseUrl: this.env.PUBLIC_FILES_BASE_URL,
      privateBaseUrl: this.env.PRIVATE_FILES_BASE_URL,
      urlSigningSecret: this.env.FILE_URL_SIGNING_SECRET,
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
}
