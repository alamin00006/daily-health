import { errorMessage } from "./error-messages";

/** An error from the API in its one shape `{ code, message, details }`. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly details: unknown,
    message: string,
  ) {
    super(message);
  }

  /** Bangla text for people. */
  get userMessage(): string {
    return errorMessage(this.code);
  }

  /** zod issues of VALIDATION_FAILED: field path → message. */
  fieldErrors(): Record<string, string> {
    const issues = (this.details as { issues?: { path: string; message: string }[] } | null)
      ?.issues;
    return Object.fromEntries((issues ?? []).map((i) => [i.path, i.message]));
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

type Query = Record<string, string | number | boolean | undefined | null>;

function withQuery(path: string, query?: Query): string {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value));
    }
  }
  const text = params.toString();
  return text ? `${path}?${text}` : path;
}

async function parse<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  const body = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) {
    const error = (body ?? {}) as { code?: string; message?: string; details?: unknown };
    const onAuthPage =
      typeof window !== "undefined" &&
      /^\/(login|signup|reset-pin)/.test(window.location.pathname);
    if (res.status === 401 && typeof window !== "undefined" && !onAuthPage) {
      // Session ended (logout elsewhere, PIN reset): back to login.
      const next = encodeURIComponent(window.location.pathname);
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- session is gone; reload without cached data
      window.location.assign(`/login?next=${next}`);
    }
    throw new ApiError(
      res.status,
      error.code ?? (res.status >= 500 ? "INTERNAL_ERROR" : "BAD_REQUEST"),
      error.details ?? null,
      error.message ?? res.statusText,
    );
  }
  return body as T;
}

async function send<T>(input: string, init: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(input, { ...init, credentials: "same-origin" });
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", null, "Network error");
  }
  return parse<T>(res);
}

/** Calls the API through the panel's /bff proxy (tokens stay in httpOnly cookies). */
export const api = {
  get: <T>(path: string, query?: Query) =>
    send<T>(withQuery(`/bff/api${path}`, query), { method: "GET" }),
  post: <T>(path: string, body?: unknown) =>
    send<T>(`/bff/api${path}`, {
      method: "POST",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  patch: <T>(path: string, body: unknown) =>
    send<T>(`/bff/api${path}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  put: <T>(path: string, body?: unknown) =>
    send<T>(`/bff/api${path}`, {
      method: "PUT",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  delete: <T = void>(path: string) => send<T>(`/bff/api${path}`, { method: "DELETE" }),
  /** multipart: `file` plus text fields. */
  upload: <T>(path: string, file: File, fields: Record<string, string> = {}, method = "POST") => {
    const form = new FormData();
    form.set("file", file);
    for (const [key, value] of Object.entries(fields)) form.set(key, value);
    return send<T>(`/bff/api${path}`, { method, body: form });
  },
  /** Session actions handled by the panel server (cookies). */
  auth: <T>(action: "login" | "login-otp" | "signup" | "pin-reset" | "logout", body?: unknown) =>
    send<T>(`/bff/auth/${action}`, {
      method: "POST",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
};
