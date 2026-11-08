const BANGLA_DIGITS = '০১২৩৪৫৬৭৮৯';

/** Bangla numerals throughout user-facing text (CLAUDE.md §7). */
export function toBanglaDigits(value: string | number): string {
  return String(value).replace(/\d/g, (digit) => BANGLA_DIGITS[Number(digit)]!);
}
