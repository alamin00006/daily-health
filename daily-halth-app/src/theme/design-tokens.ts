/**
 * Design tokens for places that need raw values (icons, ActivityIndicator,
 * native props, shadows). Keep in sync with tailwind.config.js.
 */
export const colors = {
  primary: '#0f5c5a',
  primary50: '#f0f8f5',
  primary100: '#dcefe8',
  primary300: '#93c9b9',
  primary700: '#0b4846',
  surface: '#f4f9f7',
  card: '#ffffff',
  ink: '#12302b',
  inkMuted: '#546b65',
  inkSubtle: '#869a94',
  line: '#d3e3dd',
  danger: '#c62f2f',
  dangerSoft: '#fdecec',
  success: '#1e7a46',
  warning: '#9a5b00',
  white: '#ffffff',
} as const;

/**
 * Soft, two-layer shadows (React Native ≥ 0.76 renders boxShadow on Android
 * and iOS). Tinted with the ink colour so they read as depth, not grey smudges.
 */
export const shadows = {
  card: { boxShadow: '0 1px 2px rgba(18, 48, 43, 0.05), 0 6px 16px rgba(18, 48, 43, 0.06)' },
  raised: { boxShadow: '0 2px 4px rgba(18, 48, 43, 0.06), 0 12px 28px rgba(18, 48, 43, 0.10)' },
  button: { boxShadow: '0 4px 12px rgba(15, 92, 90, 0.25)' },
} as const;

/** Icon sizes paired with text sizes. */
export const iconSize = { sm: 16, md: 20, lg: 24, xl: 28 } as const;
