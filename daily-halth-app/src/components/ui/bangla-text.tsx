import { Platform, Text, type TextProps } from 'react-native';

/**
 * Type scale. Bangla glyphs (conjuncts, vowel signs above and below) need more
 * line height than Latin text or they get clipped, so every step keeps ~1.5×.
 */
const VARIANTS = {
  display: { family: 'font-display', size: 'text-[34px] leading-[46px]', color: 'text-primary' },
  title: { family: 'font-bangla-bold', size: 'text-[24px] leading-[36px]', color: 'text-ink' },
  heading: {
    family: 'font-bangla-semibold',
    size: 'text-[18px] leading-[28px]',
    color: 'text-ink',
  },
  body: { family: 'font-bangla', size: 'text-[16px] leading-[26px]', color: 'text-ink' },
  'body-strong': {
    family: 'font-bangla-semibold',
    size: 'text-[16px] leading-[26px]',
    color: 'text-ink',
  },
  label: { family: 'font-bangla-medium', size: 'text-[14px] leading-[22px]', color: 'text-ink' },
  caption: { family: 'font-bangla', size: 'text-[13px] leading-[20px]', color: 'text-ink-muted' },
} as const;

export type TextVariant = keyof typeof VARIANTS;

/** A text colour (text-danger, text-primary-100…), not a size (text-[16px]) or alignment. */
const TEXT_COLOR_CLASS =
  /(^|\s)text-(?!\[|left\b|center\b|right\b|justify\b|xs\b|sm\b|base\b|lg\b|\d?xl\b)[a-z]/;
/** A font size or line height (text-[10px], leading-[14px]). */
const SIZE_CLASS = /(^|\s)(text-\[\d|leading-)/;
/** A font family / weight file (font-bangla-semibold, font-display…). */
const FONT_FAMILY_CLASS = /(^|\s)font-(bangla|display)/;

interface BanglaTextProps extends TextProps {
  variant?: TextVariant;
  className?: string;
}

/**
 * All text in the app. `variant` sets family, size and colour; a family,
 * size or colour in `className` replaces the variant's one instead of competing with
 * it (with both, the winner would depend on stylesheet order). Weight comes
 * from the font file, because fontWeight does not work with custom fonts.
 */
/**
 * Android measures a content-sized Text a fraction of a pixel narrower than it
 * then draws it with Hind Siliguri, so the last word of a one-line label moves
 * to a second, clipped line ("ইমেইলে কোড নিয়ে লগইন" shows without "লগইন").
 * A trailing thin space counts when measuring but is allowed to hang past the
 * line end when breaking, which gives the label the missing slack.
 */
const MEASURE_SLACK = ' ';

/** Rendered as a sibling after the children, so mixed children ("… {time} পরে") get it too. */
const measureSlack = Platform.OS === 'android' ? MEASURE_SLACK : null;

export function BanglaText({
  variant = 'body',
  className = '',
  children,
  ...props
}: BanglaTextProps) {
  const { family, size, color } = VARIANTS[variant];
  const classes = [
    FONT_FAMILY_CLASS.test(className) ? '' : family,
    SIZE_CLASS.test(className) ? '' : size,
    TEXT_COLOR_CLASS.test(className) ? '' : color,
    className,
  ];
  return (
    <Text className={classes.filter(Boolean).join(' ')} {...props}>
      {children}
      {measureSlack}
    </Text>
  );
}
