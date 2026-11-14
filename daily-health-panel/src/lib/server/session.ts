import "server-only";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import type { AuthTokensResponse } from "@/shared-contracts/auth.contract";

/**
 * The panel keeps the API tokens in httpOnly cookies, so page scripts never
 * see them (a stolen-by-XSS token is the main risk of a web panel). The
 * browser only talks to the panel's own /bff routes.
 */
export const ACCESS_COOKIE = "ds_access";
export const REFRESH_COOKIE = "ds_refresh";
/** One random id per browser, sent as the device installationId. */
export const DEVICE_COOKIE = "ds_device";

/** Matches the API's sliding refresh session (30 days). */
const REFRESH_MAX_AGE_SEC = 30 * 24 * 60 * 60;
const DEVICE_MAX_AGE_SEC = 5 * 365 * 24 * 60 * 60;

export function apiBaseUrl(): string {
  const url = process.env.API_BASE_URL;
  if (!url) throw new Error("API_BASE_URL is not set");
  return url.replace(/\/$/, "");
}

const secure = process.env.NODE_ENV === "production";

export async function saveTokens(tokens: AuthTokensResponse): Promise<void> {
  const jar = await cookies();
  jar.set(ACCESS_COOKIE, tokens.accessToken, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    // A little early, so an almost-expired token is refreshed instead of used.
    maxAge: Math.max(30, tokens.accessTokenExpiresInSec - 30),
  });
  jar.set(REFRESH_COOKIE, tokens.refreshToken, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: REFRESH_MAX_AGE_SEC,
  });
}

export async function clearTokens(): Promise<void> {
  const jar = await cookies();
  jar.delete(ACCESS_COOKIE);
  jar.delete(REFRESH_COOKIE);
}

/** The device block every login sends (one per browser). */
export async function deviceInfo() {
  const jar = await cookies();
  let installationId = jar.get(DEVICE_COOKIE)?.value;
  if (!installationId || !/^[A-Za-z0-9._-]{8,128}$/.test(installationId)) {
    installationId = `web-${randomBytes(16).toString("hex")}`;
    jar.set(DEVICE_COOKIE, installationId, {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: DEVICE_MAX_AGE_SEC,
    });
  }
  return { installationId, platform: "WEB" as const, appVersion: "panel-1" };
}

/**
 * Refresh tokens rotate and a reused one revokes the session, so two requests
 * that find an expired access token at the same time must share one refresh.
 * The panel runs as one Node process on the VPS, so an in-memory map is enough;
 * the result is kept briefly for requests that arrive just after.
 */
const refreshes = new Map<string, Promise<AuthTokensResponse | null>>();

export function refreshTokens(
  refreshToken: string,
): Promise<AuthTokensResponse | null> {
  const running = refreshes.get(refreshToken);
  if (running) return running;
  const attempt = (async () => {
    const res = await fetch(`${apiBaseUrl()}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as AuthTokensResponse;
  })().catch(() => null);
  refreshes.set(refreshToken, attempt);
  setTimeout(() => refreshes.delete(refreshToken), 15_000);
  return attempt;
}
