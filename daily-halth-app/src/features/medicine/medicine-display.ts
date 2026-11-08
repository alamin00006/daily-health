import type { PillTone } from '@/components/ui/status-pill';
import { toBanglaDigits } from '@/lib/bangla-digits';
import { formatDose } from '@/lib/bangla-format';
import type { DoseState, DoseUnit, MealTiming } from '@/shared-contracts/medicine.contract';

export const DOSE_UNIT_LABELS: Record<DoseUnit, string> = {
  TABLET: 'ট্যাবলেট',
  CAPSULE: 'ক্যাপসুল',
  ML: 'মি.লি.',
  SPOON: 'চামচ',
  DROP: 'ফোঁটা',
  PUFF: 'পাফ',
  UNIT: 'ইউনিট',
  SACHET: 'স্যাশে',
  APPLICATION: 'বার লাগানো',
};

export const MEAL_TIMING_LABELS: Record<MealTiming, string> = {
  BEFORE_MEAL: 'খাবারের আগে',
  AFTER_MEAL: 'খাবারের পরে',
  WITH_MEAL: 'খাবারের সাথে',
  ANY: 'যেকোনো সময়',
};

/** "খাবারের ৩০ মিনিট আগে" */
export function mealTimingText(timing: MealTiming, offsetMin: number | null): string {
  if (timing === 'ANY') return '';
  if (offsetMin && timing !== 'WITH_MEAL') {
    return `খাবারের ${toBanglaDigits(offsetMin)} মিনিট ${timing === 'BEFORE_MEAL' ? 'আগে' : 'পরে'}`;
  }
  return MEAL_TIMING_LABELS[timing];
}

/** "১টি ট্যাবলেট", "½ চামচ" */
export function doseText(dose: number, unit: DoseUnit): string {
  const amount = formatDose(dose);
  return unit === 'TABLET' || unit === 'CAPSULE'
    ? `${amount}টি ${DOSE_UNIT_LABELS[unit]}`
    : `${amount} ${DOSE_UNIT_LABELS[unit]}`;
}

/** "1+0+½" → "১+০+½" */
export function banglaPattern(pattern: string): string {
  return toBanglaDigits(pattern);
}

export const DOSE_STATE_META: Record<DoseState, { label: string; tone: PillTone }> = {
  UPCOMING: { label: 'আসছে', tone: 'neutral' },
  DUE: { label: 'এখন খাওয়ার সময়', tone: 'warning' },
  SNOOZED: { label: 'পরে মনে করাবে', tone: 'info' },
  TAKEN: { label: 'নেওয়া হয়েছে', tone: 'success' },
  SKIPPED: { label: 'বাদ দেওয়া হয়েছে', tone: 'neutral' },
  MISSED: { label: 'বাদ পড়েছে', tone: 'danger' },
};
