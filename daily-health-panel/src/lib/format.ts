/** Bangla formatting for the panel. Times are shown in Asia/Dhaka (CLAUDE.md §4). */
const DIGITS = "০১২৩৪৫৬৭৮৯";
const DHAKA_OFFSET_MS = 6 * 60 * 60_000;

export const BANGLA_WEEKDAYS = ["রবিবার", "সোমবার", "মঙ্গলবার", "বুধবার", "বৃহস্পতিবার", "শুক্রবার", "শনিবার"];
export const BANGLA_WEEKDAYS_SHORT = ["রবি", "সোম", "মঙ্গল", "বুধ", "বৃহঃ", "শুক্র", "শনি"];
const MONTHS = ["জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন", "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর"];

export function bn(value: string | number): string {
  return String(value).replace(/\d/g, (d) => DIGITS[Number(d)]!);
}

/** "2026-11-10" for an instant, in Dhaka. */
export function dhakaDate(instant: Date = new Date()): string {
  return new Date(instant.getTime() + DHAKA_OFFSET_MS).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/** "১০ নভেম্বর ২০২৬" */
export function formatDate(date: string, withYear = true): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return `${bn(d)} ${MONTHS[m - 1]}${withYear ? ` ${bn(y)}` : ""}`;
}

/** "মঙ্গলবার, ১০ নভেম্বর" */
export function formatDayLong(date: string): string {
  return `${BANGLA_WEEKDAYS[weekdayOf(date)]}, ${formatDate(date, false)}`;
}

export function relativeDay(date: string): string | null {
  const today = dhakaDate();
  if (date === today) return "আজ";
  if (date === addDays(today, 1)) return "আগামীকাল";
  if (date === addDays(today, -1)) return "গতকাল";
  return null;
}

/** "18:30" → "সন্ধ্যা ৬:৩০" */
export function banglaClock(hhmm: string): string {
  const [hText, minute] = hhmm.split(":") as [string, string];
  const hour = Number(hText);
  const period =
    hour >= 4 && hour < 12 ? "সকাল" : hour < 16 && hour >= 12 ? "দুপুর" : hour >= 16 && hour < 18 ? "বিকেল" : hour >= 18 && hour < 20 ? "সন্ধ্যা" : "রাত";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${period} ${bn(`${h12}:${minute}`)}`;
}

/** An ISO instant → Dhaka "HH:MM". */
export function dhakaTime(iso: string): string {
  return new Date(Date.parse(iso) + DHAKA_OFFSET_MS).toISOString().slice(11, 16);
}

export function formatInstant(iso: string): string {
  return `${formatDate(dhakaDate(new Date(iso)))}, ${banglaClock(dhakaTime(iso))}`;
}

/** "৳১,২০০" */
export function money(amount: number): string {
  const sign = amount < 0 ? "−" : "";
  const [whole, fraction] = Math.abs(amount).toFixed(2).split(".") as [string, string];
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}৳${bn(grouped)}${fraction === "00" ? "" : bn(`.${fraction}`)}`;
}

export function timeAgo(iso: string): string {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (minutes < 1) return "এইমাত্র";
  if (minutes < 60) return `${bn(minutes)} মিনিট আগে`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${bn(hours)} ঘণ্টা আগে`;
  return formatDate(dhakaDate(new Date(iso)));
}

/** 0.5 → "½", 1.5 → "১½", 2 → "২" */
export function doseLabel(dose: number): string {
  const whole = Math.floor(dose);
  const part = dose - whole;
  const fraction = part === 0.25 ? "¼" : part === 0.5 ? "½" : part === 0.75 ? "¾" : "";
  return `${whole > 0 || !fraction ? bn(whole) : ""}${fraction}`;
}
