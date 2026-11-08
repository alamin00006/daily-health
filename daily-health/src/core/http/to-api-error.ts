import { HttpException, HttpStatus } from '@nestjs/common';
import { AppException } from '../../common/errors/app-exception.js';
import {
  ErrorCode,
  type ApiErrorBody,
} from '../../common/errors/error-codes.js';
import { Prisma } from '../../generated/prisma/client.js';

export interface ApiError {
  status: number;
  body: ApiErrorBody;
  /** True when the error is unexpected and must be logged with its stack. */
  isUnexpected: boolean;
}

/**
 * Code and fixed message for framework HttpExceptions (unknown route, throttler,
 * bad JSON, body too large). Their own messages are never returned: Nest passes
 * body-parser/JSON.parse text through, which can quote parts of the request body.
 */
const BY_STATUS: Record<number, { code: string; message: string }> = {
  [HttpStatus.BAD_REQUEST]: {
    code: ErrorCode.BAD_REQUEST,
    message: 'Bad request',
  },
  [HttpStatus.UNAUTHORIZED]: {
    code: ErrorCode.UNAUTHORIZED,
    message: 'Unauthorized',
  },
  [HttpStatus.FORBIDDEN]: { code: ErrorCode.FORBIDDEN, message: 'Forbidden' },
  [HttpStatus.NOT_FOUND]: { code: ErrorCode.NOT_FOUND, message: 'Not found' },
  [HttpStatus.METHOD_NOT_ALLOWED]: {
    code: ErrorCode.METHOD_NOT_ALLOWED,
    message: 'Method not allowed',
  },
  [HttpStatus.CONFLICT]: { code: ErrorCode.CONFLICT, message: 'Conflict' },
  [HttpStatus.PAYLOAD_TOO_LARGE]: {
    code: ErrorCode.PAYLOAD_TOO_LARGE,
    message: 'Request body too large',
  },
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: {
    code: ErrorCode.UNSUPPORTED_MEDIA_TYPE,
    message: 'Unsupported media type',
  },
  [HttpStatus.TOO_MANY_REQUESTS]: {
    code: ErrorCode.TOO_MANY_REQUESTS,
    message: 'Too many requests',
  },
  [HttpStatus.SERVICE_UNAVAILABLE]: {
    code: ErrorCode.SERVICE_UNAVAILABLE,
    message: 'Service unavailable',
  },
};

const INTERNAL: ApiError = {
  status: HttpStatus.INTERNAL_SERVER_ERROR,
  body: {
    code: ErrorCode.INTERNAL_ERROR,
    message: 'Internal server error',
    details: null,
  },
  isUnexpected: true,
};

function build(status: number, code?: string, message?: string): ApiError {
  const known = BY_STATUS[status];
  return {
    status,
    body: {
      code: code ?? known?.code ?? ErrorCode.BAD_REQUEST,
      message: message ?? known?.message ?? 'Request failed',
      details: null,
    },
    isUnexpected: false,
  };
}

/**
 * Maps any thrown value to the single API error shape `{ code, message, details }`.
 * Only AppException messages reach the client; everything else gets a fixed text.
 */
export function toApiError(exception: unknown): ApiError {
  // Thrown on purpose, so its code/message/details are safe to return as is.
  if (exception instanceof AppException) {
    return {
      status: exception.getStatus(),
      body: {
        code: exception.code,
        message: exception.message,
        details: exception.details,
      },
      isUnexpected: false,
    };
  }

  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    if (status === Number(HttpStatus.SERVICE_UNAVAILABLE)) return build(status);
    return status >= 500 ? INTERNAL : build(status);
  }

  if (exception instanceof Prisma.PrismaClientKnownRequestError) {
    switch (exception.code) {
      case 'P2002': // unique constraint
        return build(
          HttpStatus.CONFLICT,
          ErrorCode.CONFLICT,
          'Resource already exists',
        );
      case 'P2025': // record required but not found
        return build(
          HttpStatus.NOT_FOUND,
          ErrorCode.NOT_FOUND,
          'Resource not found',
        );
      case 'P2003': // foreign key violation
        return build(
          HttpStatus.BAD_REQUEST,
          ErrorCode.BAD_REQUEST,
          'Related resource does not exist',
        );
      default:
        return INTERNAL;
    }
  }

  return INTERNAL;
}
