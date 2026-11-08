import { toBanglaDigits } from './bangla-digits';

/**
 * Bangla dates, times and amounts for the UI (CLAUDE.md §7: Bangla numerals).
 * Written by hand instead of Intl: Hermes' Intl data differs between Android
 * versions, and the app must look the same on cheap phones.
 * Asia/Dhaka is UTC+6 all year, so a fixed offset is exact.
 */
const DHAKA_OFFSET_MS = 6 * 60 * 60_000;

export const BANGLA_MONTHS = [
  'জানুয়ারি',
  'ফেব্রুয়ারি',
  'মার্চ',
  'এপ্রিল',
  'মে',
  'জুন',
  'জুলাই',
  'আগস্ট',
  'সেপ্টেম্বর',
  'অক্টোবর',
  'নভেম্বর',
  'ডিসেম্বর',
];

/** 0 = Sunday … 6 = Saturday. */
export const BANGLA_WEEKDAYS = [
  'রবিবার',
  'সোমবার',
  'মঙ্গলবার',
  'বুধবার',
  'বৃহস্পতিবার',
  'শুক্রবার',
  'শনিবার',
];
export const BANGLA_WEEKDAYS_SHORT = ['রবি', 'সোম', 'মঙ্গল', 'বুধ', 'বৃহঃ', 'শুক্র', 'শনি'];

/** "2026-11-08" in Asia/Dhaka. */
export function dhakaDate(instant: Date = new Date()): string {
  return new Date(instant.getTime() + DHAKA_OFFSET_MS).toISOString().slice(0, 10);
}

/** "08:30" in Asia/Dhaka. */
export function dhakaTime(instant: Date): string {
  return new Date(instant.getTime() + DHAKA_OFFSET_MS).toISOString().slice(11, 16);
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00.000Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00.000Z`).getUTCDay();
}

/** "2026-11-08" → "৮ নভেম্বর ২০২৬" (year left out when `withYear` is false). */
export function formatDate(date: string, withYear = true): string {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  const text = `${toBanglaDigits(day)} ${BANGLA_MONTHS[month - 1]}`;
  return withYear ? `${text} ${toBanglaDigits(year)}` : text;
}

/** ISO instant → "৮ নভেম্বর, রাত ৯:০০". */
export function formatDateTime(iso: string): string {
  const instant = new Date(iso);
  const date = dhakaDate(instant);
  const sameYear = date.slice(0, 4) === dhakaDate().slice(0, 4);
  return `${formatDate(date, !sameYear)}, ${banglaClock(dhakaTime(instant))}`;
}

/** "আজ", "গতকাল", "আগামীকাল" or the date. */
export function relativeDay(date: string): string {
  const today = dhakaDate();
  if (date === today) return 'আজ';
  if (date === addDays(today, -1)) return 'গতকাল';
  if (date === addDays(today, 1)) return 'আগামীকাল';
  return formatDate(date, date.slice(0, 4) !== today.slice(0, 4));
}

/** "21:00" → "রাত ৯:০০", the way people say times in Bangla. */
export function banglaClock(hhmm: string): string {
  const [hourText, minute] = hhmm.split(':') as [string, string];
  const hour = Number(hourText);
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${dayPeriod(hour)} ${toBanglaDigits(`${hour12}:${minute}`)}`;
}

export function dayPeriod(hour: number): string {
  if (hour >= 4 && hour < 12) return 'সকাল';
  if (hour >= 12 && hour < 16) return 'দুপুর';
  if (hour >= 16 && hour < 18) return 'বিকেল';
  if (hour >= 18 && hour < 20) return 'সন্ধ্যা';
  return 'রাত';
}

/** "৫ মিনিট আগে", "২ ঘণ্টা আগে", then the date. */
export function timeAgo(iso: string, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (seconds < 60) return 'এইমাত্র';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${toBanglaDigits(minutes)} মিনিট আগে`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${toBanglaDigits(hours)} ঘণ্টা আগে`;
  return formatDateTime(iso);
}

const FRACTIONS: Record<string, string> = { '0.25': '¼', '0.5': '½', '0.75': '¾' };

/** 0.5 → "½", 1.5 → "১½", 2 → "২". */
export function formatDose(dose: number): string {
  const whole = Math.floor(dose);
  const fraction = FRACTIONS[String(Math.round((dose - whole) * 100) / 100)];
  if (!fraction) return toBanglaDigits(dose);
  return whole === 0 ? fraction : `${toBanglaDigits(whole)}${fraction}`;
}

/** Plain decimal with Bangla digits: 7.2 → "৭.২". */
export function formatNumber(value: number, fractionDigits = 1): string {
  const rounded = Number(value.toFixed(fractionDigits));
  return toBanglaDigits(rounded);
}

/** Whole years from "1958-08-02", on today's Dhaka date. */
export function ageInYears(dateOfBirth: string, today = dhakaDate()): number {
  const [by, bm, bd] = dateOfBirth.split('-').map(Number) as [number, number, number];
  const [ty, tm, td] = today.split('-').map(Number) as [number, number, number];
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age -= 1;
  return Math.max(age, 0);
}

/** "1.2 MB", "350 KB" in Bangla digits. */
export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${formatNumber(bytes / (1024 * 1024))} MB`;
  return `${toBanglaDigits(Math.max(1, Math.round(bytes / 1024)))} KB`;
}
