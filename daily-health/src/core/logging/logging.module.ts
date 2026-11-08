import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { AppConfigService } from '../config/app-config.service.js';

export const REQUEST_ID_HEADER = 'x-request-id';

/** Accept an upstream id (Nginx $request_id) only if it looks harmless. */
const INCOMING_REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{8,128}$/;

function resolveRequestId(req: IncomingMessage, res: ServerResponse): string {
  const incoming = req.headers[REQUEST_ID_HEADER];
  const id =
    typeof incoming === 'string' && INCOMING_REQUEST_ID_PATTERN.test(incoming)
      ? incoming
      : randomUUID();
  res.setHeader(REQUEST_ID_HEADER, id);
  return id;
}

/** Query strings are dropped: they could carry phone numbers or other personal data. */
function pathOnly(url: string | undefined): string | undefined {
  return url?.split('?')[0];
}

/**
 * Structured logs with a request id on every line.
 * Privacy (CLAUDE.md §4): only method, path and status are logged for a request:
 * no headers (tokens), no query strings, no bodies (PINs, health data).
 */
@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        pinoHttp: {
          level: config.logLevel,
          genReqId: resolveRequestId,
          customLogLevel: (_req, res, error) => {
            if (error || res.statusCode >= 500) return 'error';
            if (res.statusCode >= 400) return 'warn';
            return 'info';
          },
          autoLogging: {
            ignore: (req) => pathOnly(req.url) === '/api/health',
          },
          serializers: {
            req: (req: { id: unknown; method: string; url: string }) => ({
              id: req.id,
              method: req.method,
              url: pathOnly(req.url),
            }),
            res: (res: { statusCode: number }) => ({
              statusCode: res.statusCode,
            }),
          },
          transport:
            config.appEnv === 'development'
              ? { target: 'pino-pretty', options: { singleLine: true } }
              : undefined,
        },
      }),
    }),
  ],
})
export class LoggingModule {}
