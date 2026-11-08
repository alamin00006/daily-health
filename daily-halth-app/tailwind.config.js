/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,tsx}'],

  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      // Brand tokens from the prototype (CLAUDE.md §7), plus tints and semantic colours.
      // Raw values for icons and native props: src/theme/design-tokens.ts.
      colors: {
        primary: {
          DEFAULT: '#0f5c5a',
          50: '#f0f8f5',
          100: '#dcefe8',
          200: '#bfe0d5',
          300: '#93c9b9',
          400: '#4f9f91',
          500: '#1f7a74',
          600: '#0f5c5a',
          700: '#0b4846',
          800: '#083635',
          mint: '#dcefe8',
          soft: '#e4f3ed',
        },
        surface: { DEFAULT: '#f4f9f7', card: '#ffffff' },
        ink: { DEFAULT: '#12302b', muted: '#546b65', subtle: '#869a94' },
        line: { DEFAULT: '#d3e3dd', strong: '#b4cbc3' },
        rose: { DEFAULT: '#c2475e', soft: '#fbe4e8' },
        nutrition: { DEFAULT: '#2f6b2f', soft: '#e3f1df' },
        danger: { DEFAULT: '#c62f2f', soft: '#fdecec' },
        success: { DEFAULT: '#1e7a46', soft: '#e2f3e9' },
        warning: { DEFAULT: '#9a5b00', soft: '#fdf0d9' },
      },
      // One font file per weight: React Native cannot synthesise weights for custom fonts.
      fontFamily: {
        bangla: ['HindSiliguri_400Regular'],
        'bangla-medium': ['HindSiliguri_500Medium'],
        'bangla-semibold': ['HindSiliguri_600SemiBold'],
        'bangla-bold': ['HindSiliguri_700Bold'],
        display: ['BalooDa2_700Bold'],
      },
      borderRadius: { '4xl': '28px' },
      minHeight: { touch: '44px' },
      minWidth: { touch: '44px' },
    },
  },
  plugins: [],
};
