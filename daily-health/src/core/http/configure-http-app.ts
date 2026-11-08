import { VersioningType } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import type { AppConfigService } from '../config/app-config.service.js';
import { API_PATH_PREFIX } from './api-path-prefix.js';
import { setupSwaggerDocs } from './setup-swagger-docs.js';

/** JSON bodies are small; file uploads use multipart with their own limits. */
const JSON_BODY_LIMIT = '1mb';

/** HTTP-level setup applied in main.ts: security headers, CORS, body limits, /api prefix, /v1 versioning, Swagger. */
export function configureHttpApp(
  app: NestExpressApplication,
  config: AppConfigService,
): void {
  // Behind Nginx, so req.ip (used by the throttler) is the real client IP.
  app.set('trust proxy', config.trustProxyHops);

  app.use(
    helmet({
      // Swagger UI needs inline assets; the API itself only returns JSON.
      contentSecurityPolicy: config.swaggerEnabled ? false : undefined,
    }),
  );

  app.enableCors({
    origin: [...config.corsOrigins],
    credentials: true,
    exposedHeaders: ['x-request-id'],
  });

  app.useBodyParser('json', { limit: JSON_BODY_LIMIT });
  app.useBodyParser('urlencoded', { limit: JSON_BODY_LIMIT, extended: false });

  // Every route lives under /api, so Nginx can route the API and other paths separately.
  app.setGlobalPrefix(API_PATH_PREFIX);

  // Every route lives under /api/v1 unless it opts out with VERSION_NEUTRAL (/api/health).
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  app.enableShutdownHooks();

  setupSwaggerDocs(app, config);
}
