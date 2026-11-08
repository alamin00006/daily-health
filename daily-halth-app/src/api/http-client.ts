import { AxiosError, create, type InternalAxiosRequestConfig } from 'axios';

import { ApiError, ClientErrorCode } from './api-error';

import { API_BASE_URL, API_TIMEOUT_MS } from '@/config/app-environment';

declare module 'axios' {
  interface AxiosRequestConfig {
    /** Send the access token (and refresh it once if the API says it expired). */
    authenticated?: boolean;
    /** Internal: set on the single retry after a token refresh. */
    retriedAfterRefresh?: boolean;
  }
}

/**
 * How the client gets tokens. Registered by the session store, which keeps
 * this module free of a circular import (the store itself calls the API).
 */
export interface AccessTokenProvider {
  /** A usable access token, refreshing first if there is none. */
  getAccessToken(): Promise<string | null>;
  /** Called when the API rejected the token: refresh and return the new one, or null. */
  refreshAccessToken(): Promise<string | null>;
}

let tokenProvider: AccessTokenProvider | null = null;

export function registerAccessTokenProvider(provider: AccessTokenProvider): void {
  tokenProvider = provider;
}

/** Codes meaning "this access token is no good"; anything else on 401 is final. */
const RETRYABLE_AUTH_CODES = new Set(['ACCESS_TOKEN_EXPIRED', 'UNAUTHORIZED']);

export const apiClient = create({
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUT_MS,
  headers: { Accept: 'application/json' },
  // Timeouts surface as ETIMEDOUT instead of the ambiguous ECONNABORTED.
  transitional: { clarifyTimeoutError: true },
});

apiClient.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  if (!config.authenticated) return config;
  const token = await tokenProvider?.getAccessToken();
  if (!token) throw new ApiError(401, 'UNAUTHORIZED', 'Not logged in');
  config.headers.set('Authorization', `Bearer ${token}`);
  return config;
});

apiClient.interceptors.response.use(undefined, async (error: unknown) => {
  const apiError = toApiError(error);
  const config = error instanceof AxiosError ? error.config : undefined;

  if (
    config?.authenticated &&
    !config.retriedAfterRefresh &&
    apiError.status === 401 &&
    RETRYABLE_AUTH_CODES.has(apiError.code)
  ) {
    const token = await tokenProvider?.refreshAccessToken();
    if (token) {
      config.retriedAfterRefresh = true;
      config.headers.set('Authorization', `Bearer ${token}`);
      // Skip the request interceptor's token lookup: the fresh token is already set.
      return apiClient.request({ ...config, authenticated: false });
    }
  }
  throw apiError;
});

/** Every failure leaves the client as an ApiError with the API's `{ code, message, details }`. */
function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (!(error instanceof AxiosError)) {
    return new ApiError(0, ClientErrorCode.NETWORK_ERROR, 'Request failed');
  }

  if (error.response) {
    const body = (error.response.data ?? {}) as {
      code?: unknown;
      message?: unknown;
      details?: unknown;
    };
    const status = error.response.status;
    if (typeof body !== 'object') {
      return new ApiError(status, ClientErrorCode.INVALID_RESPONSE, `HTTP ${status}`);
    }
    return new ApiError(
      status,
      typeof body.code === 'string' ? body.code : 'INTERNAL_ERROR',
      typeof body.message === 'string' ? body.message : `HTTP ${status}`,
      body.details ?? null
    );
  }

  if (error.code === AxiosError.ETIMEDOUT || error.code === AxiosError.ECONNABORTED) {
    return new ApiError(0, ClientErrorCode.TIMEOUT, 'Request timed out');
  }
  return new ApiError(0, ClientErrorCode.NETWORK_ERROR, 'Network request failed');
}

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface ApiRequestOptions {
  method?: HttpMethod;
  body?: unknown;
  authenticated?: boolean;
  signal?: AbortSignal;
}

/** A local file picked by the user, sent as one multipart part. */
export interface UploadFile {
  uri: string;
  name: string;
  /** MIME type, e.g. image/jpeg or application/pdf. */
  type: string;
}

/**
 * multipart/form-data upload (reports, profile photo). Text fields go next to
 * the `file` part. Uploads get a longer timeout: networks are slow (CLAUDE.md §8).
 */
export async function apiUpload<T>(
  path: string,
  file: UploadFile,
  fields: Record<string, string | null | undefined> = {},
  method: 'POST' | 'PUT' = 'POST'
): Promise<T> {
  const form = new FormData();
  // React Native's FormData takes { uri, name, type } for a file part.
  form.append('file', file as unknown as Blob);
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value !== null) form.append(key, value);
  }
  const response = await apiClient.request<T>({
    url: path,
    method,
    data: form,
    authenticated: true,
    timeout: 120_000,
    headers: { 'Content-Type': 'multipart/form-data' },
    // Leave the FormData alone; the native layer writes the multipart body.
    transformRequest: (data: unknown) => data,
  });
  return response.data;
}

/** Typed request helper used by the endpoint modules. Resolves to the response body. */
export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const response = await apiClient.request<T>({
    url: path,
    method: options.method ?? 'GET',
    data: options.body,
    authenticated: options.authenticated ?? false,
    signal: options.signal,
  });
  return (response.status === 204 ? undefined : response.data) as T;
}
