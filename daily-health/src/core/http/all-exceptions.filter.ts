import {
  Catch,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { toApiError } from './to-api-error.js';

/**
 * Global HTTP filter: every error leaves the API as `{ code, message, details }`.
 * Unexpected errors are logged with their stack; request bodies are never logged.
 * (Socket.io gets its own filter in the chat module.)
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { status, body, isUnexpected } = toApiError(exception);

    if (isUnexpected) {
      this.logger.error(
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    if (host.getType() !== 'http') return;
    const response: unknown = host.switchToHttp().getResponse();
    this.httpAdapterHost.httpAdapter.reply(response, body, status);
  }
}
