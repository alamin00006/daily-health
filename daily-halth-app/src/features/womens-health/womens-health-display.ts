import type { PillTone } from '@/components/ui/status-pill';
import type {
  CycleGoal,
  CyclePhase,
  Flow,
  Mood,
  Symptom,
} from '@/shared-contracts/womens-health.contract';

export const PHASE_META: Record<CyclePhase, { label: string; hint: string; tone: PillTone }> = {
  PERIOD: { label: 'পিরিয়ড চলছে', hint: 'বিশ্রাম নিন, পানি বেশি খান।', tone: 'danger' },
  FOLLICULAR: { label: 'স্বাভাবিক সময়', hint: 'শরীরে শক্তি সাধারণত বেশি থাকে।', tone: 'info' },
  FERTILE: { label: 'উর্বর সময়', hint: 'এই কয়দিন গর্ভধারণের সম্ভাবনা সবচেয়ে বেশি।', tone: 'warning' },
  LUTEAL: { label: 'পিরিয়ডের আগের সময়', hint: 'মেজাজ ওঠানামা বা পেট ফাঁপা হতে পারে।', tone: 'neutral' },
  LATE: { label: 'পিরিয়ড দেরি হচ্ছে', hint: 'শুরু হলে নিচের বোতাম চাপুন।', tone: 'warning' },
  UNKNOWN: { label: 'তথ্য নেই', hint: 'শেষ পিরিয়ডের তারিখ দিন, তাহলে হিসাব শুরু হবে।', tone: 'neutral' },
};

export const FLOW_LABELS: Record<Flow, string> = {
  NONE: 'নেই',
  SPOTTING: 'ফোঁটা ফোঁটা',
  LIGHT: 'হালকা',
  MEDIUM: 'মাঝারি',
  HEAVY: 'বেশি',
};

export const MOOD_LABELS: Record<Mood, string> = {
  HAPPY: '😊 ভালো',
  CALM: '😌 শান্ত',
  SAD: '😔 মন খারাপ',
  IRRITABLE: '😤 খিটখিটে',
  ANXIOUS: '😟 দুশ্চিন্তা',
};

export const SYMPTOM_LABELS: Record<Symptom, string> = {
  CRAMPS: 'পেটে ব্যথা',
  HEADACHE: 'মাথাব্যথা',
  FATIGUE: 'ক্লান্তি',
  BLOATING: 'পেট ফাঁপা',
  BACKACHE: 'কোমর ব্যথা',
  ACNE: 'ব্রণ',
  BREAST_TENDERNESS: 'স্তনে ব্যথা',
  NAUSEA: 'বমি ভাব',
  CRAVINGS: 'খাবারের ইচ্ছা',
  INSOMNIA: 'ঘুম কম',
};

export const GOAL_LABELS: Record<CycleGoal, string> = {
  TRACK: 'শুধু হিসাব রাখা',
  CONCEIVE: 'সন্তান নিতে চাই',
  AVOID: 'এখন সন্তান চাই না',
  PREGNANT: 'গর্ভবতী',
};

export const TRIMESTER_LABELS = { 1: 'প্রথম ত্রৈমাসিক', 2: 'দ্বিতীয় ত্রৈমাসিক', 3: 'তৃতীয় ত্রৈমাসিক' } as const;

/** A rough, friendly size comparison for the baby, by completed week. */
export function babySizeHint(week: number): string | null {
  const sizes: [number, string][] = [
    [4, 'পোস্তদানার মতো'],
    [8, 'আঙুরের মতো'],
    [12, 'লেবুর মতো'],
    [16, 'পেয়ারার মতো'],
    [20, 'কলার মতো'],
    [24, 'ভুট্টার মতো'],
    [28, 'বেগুনের মতো'],
    [32, 'নারকেলের মতো'],
    [36, 'পেঁপের মতো'],
    [40, 'ছোট তরমুজের মতো'],
  ];
  let hint: string | null = null;
  for (const [w, text] of sizes) if (week >= w) hint = text;
  return hint;
}
