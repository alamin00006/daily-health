/**
 * Machine-readable error codes. The app maps each `code` to Bangla text, so
 * codes are a public contract: add new ones, never rename existing ones.
 * Module-specific codes (e.g. OTP_EXPIRED) are added by their modules.
 */
export const ErrorCode = {
  BAD_REQUEST: 'BAD_REQUEST',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  METHOD_NOT_ALLOWED: 'METHOD_NOT_ALLOWED',
  CONFLICT: 'CONFLICT',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  UNSUPPORTED_MEDIA_TYPE: 'UNSUPPORTED_MEDIA_TYPE',
  TOO_MANY_REQUESTS: 'TOO_MANY_REQUESTS',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
} as const;

export type CoreErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/** The one error shape every route returns (CLAUDE.md §4). */
export interface ApiErrorBody {
  code: string;
  message: string;
  details: unknown;
}
