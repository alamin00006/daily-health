import { toBanglaDigits } from './bangla-digits.js';

/** "21:00" → "রাত ৯:০০", the way people say times in Bangla. */
export function banglaClock(hhmm: string): string {
  const [hourText, minute] = hhmm.split(':') as [string, string];
  const hour = Number(hourText);
  const period =
    hour >= 4 && hour < 12
      ? 'সকাল'
      : hour >= 12 && hour < 16
        ? 'দুপুর'
        : hour >= 16 && hour < 18
          ? 'বিকেল'
          : hour >= 18 && hour < 20
            ? 'সন্ধ্যা'
            : 'রাত';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${period} ${toBanglaDigits(`${hour12}:${minute}`)}`;
}
