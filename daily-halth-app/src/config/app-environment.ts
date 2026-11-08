/**
 * Build-time configuration. Expo inlines EXPO_PUBLIC_* from .env when bundling,
 * so these must be read as literal `process.env.EXPO_PUBLIC_...` expressions.
 */
const rawApiUrl = process.env.EXPO_PUBLIC_API_URL;

if (!rawApiUrl) {
  throw new Error('EXPO_PUBLIC_API_URL is not set. Copy .env.example to .env and restart Expo.');
}

/** e.g. "http://10.0.2.2:3000/api/v1" */
export const API_BASE_URL = `${rawApiUrl.replace(/\/+$/, '')}/api/v1`;

/** Requests slower than this fail with a timeout (slow networks are common; CLAUDE.md §8). */
export const API_TIMEOUT_MS = 20_000;
