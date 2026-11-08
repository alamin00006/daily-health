import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { AppConfigService } from '../config/app-config.service.js';
import { API_PATH_PREFIX } from './api-path-prefix.js';

/** Swagger UI at /api/docs, development and staging only (CLAUDE.md §4). */
export function setupSwaggerDocs(
  app: INestApplication,
  config: AppConfigService,
): void {
  if (!config.swaggerEnabled) return;

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('দৈনিক স্বাস্থ্য API')
      .setDescription(
        'Errors always use `{ code, message, details }`. Lists use cursor pagination `{ data, meta: { cursor, hasMore } }`.',
      )
      .setVersion('1')
      .addBearerAuth()
      .build(),
  );
  SwaggerModule.setup(`${API_PATH_PREFIX}/docs`, app, document);
}
