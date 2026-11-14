import { toBanglaDigits } from '@/lib/bangla-digits';

/** Whole days from one calendar date ("2026-11-05") to another; negative if `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** "আজ", "কাল", "২০ দিন পরে", "৩ দিন দেরি". */
export function daysUntilText(days: number): string {
  if (days === 0) return 'আজ';
  if (days === 1) return 'আগামীকাল';
  if (days > 1) return `${toBanglaDigits(days)} দিন পরে`;
  return `${toBanglaDigits(-days)} দিন দেরি`;
}
