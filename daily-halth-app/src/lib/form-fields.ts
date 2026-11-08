import { z } from 'zod';

import { toAsciiDigits } from './bangla-digits';

/**
 * Form field schemas with Bangla messages. Text inputs always give strings,
 * often typed on a Bangla keyboard ("১২০"), so numbers are parsed from text.
 */
export function requiredText(max: number, emptyMessage: string) {
  return z.string().trim().min(1, emptyMessage).max(max, `সর্বোচ্চ ${max} অক্ষর লেখা যাবে।`);
}

/** Empty → null. */
export function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max, `সর্বোচ্চ ${max} অক্ষর লেখা যাবে।`)
    .transform((value) => (value === '' ? null : value));
}

interface NumberTextOptions {
  min: number;
  max: number;
  /** 1 = whole numbers, 0.1 = one decimal, 0.25 = quarter doses. */
  step?: number;
  emptyMessage: string;
  rangeMessage: string;
}

function parseNumber(value: string): number | null {
  const normalised = toAsciiDigits(value).replace(',', '.').trim();
  if (normalised === '' || !/^\d+(\.\d+)?$/.test(normalised)) return null;
  return Number(normalised);
}

export function numberText({ min, max, step, emptyMessage, rangeMessage }: NumberTextOptions) {
  return z.string().transform((value, ctx) => {
    if (value.trim() === '') {
      ctx.addIssue({ code: 'custom', message: emptyMessage });
      return z.NEVER;
    }
    const parsed = parseNumber(value);
    if (parsed === null || parsed < min || parsed > max) {
      ctx.addIssue({ code: 'custom', message: rangeMessage });
      return z.NEVER;
    }
    return step ? Math.round(parsed / step) * step : parsed;
  });
}

/** Same, but an empty field is allowed (→ null). */
export function optionalNumberText(options: Omit<NumberTextOptions, 'emptyMessage'>) {
  return z.string().transform((value, ctx): number | null => {
    if (value.trim() === '') return null;
    const parsed = parseNumber(value);
    if (parsed === null || parsed < options.min || parsed > options.max) {
      ctx.addIssue({ code: 'custom', message: options.rangeMessage });
      return z.NEVER;
    }
    return options.step ? Math.round(parsed / options.step) * options.step : parsed;
  });
}
