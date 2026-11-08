import { API_BASE_URL } from '@/config/app-environment';

/** "http://10.0.2.2:3000/api/v1" → "10.0.2.2" (React Native's URL has no reliable hostname). */
const apiHost = /^[a-z]+:\/\/([^/:]+)/i.exec(API_BASE_URL)?.[1] ?? null;
const LOCAL_HOST = /^([a-z]+:\/\/)(localhost|127\.0\.0\.1)(?=[:/])/i;

/**
 * File URLs come from the API, signed and short-lived. In development the API
 * builds them with "localhost", which an emulator or phone cannot reach: point
 * them at the host the app already uses for the API (the signature covers the
 * path only, so the host may change).
 */
export function resolveFileUrl(url: string): string;
export function resolveFileUrl(url: string | null): string | null;
export function resolveFileUrl(url: string | null): string | null {
  if (!url || !__DEV__ || !apiHost) return url;
  return url.replace(LOCAL_HOST, `$1${apiHost}`);
}
