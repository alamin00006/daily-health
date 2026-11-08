const BANGLA_DIGITS = '০১২৩৪৫৬৭৮৯';

/** Bangla numerals throughout the UI (CLAUDE.md §7). */
export function toBanglaDigits(value: string | number): string {
  return String(value).replace(/\d/g, (digit) => BANGLA_DIGITS[Number(digit)]!);
}

/** Users may type with a Bangla keyboard; the API expects ASCII digits. */
export function toAsciiDigits(value: string): string {
  return value.replace(/[০-৯]/g, (digit) => String(BANGLA_DIGITS.indexOf(digit)));
}
