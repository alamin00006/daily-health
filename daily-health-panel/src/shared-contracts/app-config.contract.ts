// Copied from the API (daily-health/src/shared-contracts) by scripts/copy-shared-contracts.mjs. Do not edit here.
import { z } from 'zod';

/**
 * App-wide look set by admins in the panel: the primary (brand) colour of the
 * mobile app. Emergency red, women's-health rose and nutrition green keep their
 * fixed colours, because they carry meaning.
 */

export const DEFAULT_PRIMARY_COLOR = '#0f5c5a';

/** The prototype's teal shades (also the CSS defaults in the app's global.css). */
const DEFAULT_PALETTE = {
  '50': '#f0f8f5',
  '100': '#dcefe8',
  '200': '#bfe0d5',
  '300': '#93c9b9',
  '400': '#4f9f91',
  '500': '#1f7a74',
  '600': '#0f5c5a',
  '700': '#0b4846',
  '800': '#083635',
  mint: '#dcefe8',
  soft: '#e4f3ed',
} as const;

/** White text on the primary colour must stay readable (WCAG AA for normal text). */
export const MIN_PRIMARY_CONTRAST = 4.5;

export const hexColorSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^#[0-9a-f]{6}$/, 'A colour like #0f5c5a');

export type PrimaryShade = '50' | '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800';
export type PrimaryPalette = Record<PrimaryShade, string> & { mint: string; soft: string };

// GET /api/v1/app-config (public, guests too)
export interface AppConfigResponse {
  primaryColor: string;
  palette: PrimaryPalette;
  updatedAt: string;
}

export interface AdminAppConfigResponse extends AppConfigResponse {
  updatedByName: string | null;
}

// PATCH /api/v1/admin/app-config (ADMIN)
export const updateAppConfigRequestSchema = z.object({
  primaryColor: hexColorSchema.refine((hex) => contrastWithWhite(hex) >= MIN_PRIMARY_CONTRAST, {
    message: 'Too light: white text on it would be hard to read',
  }),
});
export type UpdateAppConfigRequest = z.infer<typeof updateAppConfigRequestSchema>;

export interface AppConfigChangeResponse {
  id: string;
  fromColor: string;
  toColor: string;
  changedByName: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Colour maths (shared so the API, the panel preview and the app agree)
// ---------------------------------------------------------------------------

function toRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;
}

/** Mix `hex` with `with` (white or black) by `amount` (0 = hex, 1 = with). */
function mix(hex: string, withHex: string, amount: number): string {
  const a = toRgb(hex);
  const b = toRgb(withHex);
  return toHex([0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * amount) as [number, number, number]);
}

function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio of white text on `hex` (1–21). */
export function contrastWithWhite(hex: string): number {
  return 1.05 / (luminance(hex) + 0.05);
}

/**
 * Tints and shades of the primary colour, in the same steps the app's design uses
 * (600 = the colour itself; 50–300 for soft backgrounds, 700–800 for pressed states).
 */
export function primaryPalette(primary: string): PrimaryPalette {
  const p = primary.toLowerCase();
  // The original teal keeps its hand-tuned shades from the prototype (CLAUDE.md §7).
  if (p === DEFAULT_PRIMARY_COLOR) return { ...DEFAULT_PALETTE };
  return {
    '50': mix(p, '#ffffff', 0.94),
    '100': mix(p, '#ffffff', 0.86),
    '200': mix(p, '#ffffff', 0.74),
    '300': mix(p, '#ffffff', 0.56),
    '400': mix(p, '#ffffff', 0.3),
    '500': mix(p, '#ffffff', 0.12),
    '600': p,
    '700': mix(p, '#000000', 0.22),
    '800': mix(p, '#000000', 0.42),
    mint: mix(p, '#ffffff', 0.86),
    soft: mix(p, '#ffffff', 0.89),
  };
}
