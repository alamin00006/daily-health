/** Client-side codes for failures that never reached the API. */
export const ClientErrorCode = {
  NETWORK_ERROR: 'NETWORK_ERROR',
  TIMEOUT: 'TIMEOUT',
  INVALID_RESPONSE: 'INVALID_RESPONSE',
} as const;

/**
 * Every failed request becomes an ApiError with the API's `{ code, message, details }`
 * (CLAUDE.md §4). UI text is chosen from `code`, never from `message`.
 */
export class ApiError extends Error {
  constructor(
    /** HTTP status, or 0 when the request never got a response. */
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: unknown = null
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** No response at all: offline, DNS failure, timeout. Safe to retry. */
  get isConnectivityProblem(): boolean {
    return this.status === 0;
  }

  /** Reads a numeric field from `details`, e.g. retryAfterSec or attemptsLeft. */
  detailNumber(key: string): number | null {
    if (!this.details || typeof this.details !== 'object') return null;
    const value = (this.details as Record<string, unknown>)[key];
    return typeof value === 'number' ? value : null;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}
