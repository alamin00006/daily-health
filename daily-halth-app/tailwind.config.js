/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,tsx}'],

  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      // Brand tokens from the prototype (CLAUDE.md §7), plus tints and semantic colours.
      // Raw values for icons and native props: src/theme/design-tokens.ts.
      colors: {
        // Admins can change the primary colour (panel → অ্যাপের রং), so its shades are CSS
        // variables set at runtime (src/theme/runtime-theme.tsx); defaults in global.css.
        primary: {
          DEFAULT: 'rgb(var(--primary-600) / <alpha-value>)',
          50: 'rgb(var(--primary-50) / <alpha-value>)',
          100: 'rgb(var(--primary-100) / <alpha-value>)',
          200: 'rgb(var(--primary-200) / <alpha-value>)',
          300: 'rgb(var(--primary-300) / <alpha-value>)',
          400: 'rgb(var(--primary-400) / <alpha-value>)',
          500: 'rgb(var(--primary-500) / <alpha-value>)',
          600: 'rgb(var(--primary-600) / <alpha-value>)',
          700: 'rgb(var(--primary-700) / <alpha-value>)',
          800: 'rgb(var(--primary-800) / <alpha-value>)',
          mint: 'rgb(var(--primary-mint) / <alpha-value>)',
          soft: 'rgb(var(--primary-soft) / <alpha-value>)',
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
