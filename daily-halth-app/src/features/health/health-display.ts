import {
  Activity,
  Droplet,
  HeartPulse,
  Scale,
  Thermometer,
  Wind,
  type LucideIcon,
} from 'lucide-react-native';

import type { PillTone } from '@/components/ui/status-pill';
import { toBanglaDigits } from '@/lib/bangla-digits';
import { formatNumber } from '@/lib/bangla-format';
import type {
  ConditionKind,
  VitalContext,
  VitalReadingResponse,
  VitalStatus,
  VitalType,
} from '@/shared-contracts/health.contract';
import type { MedicalFileType } from '@/shared-contracts/records.contract';

export const VITAL_TYPES: VitalType[] = ['BP', 'GLUCOSE', 'WEIGHT', 'PULSE', 'TEMP', 'SPO2'];

export const VITAL_META: Record<
  VitalType,
  { label: string; shortLabel: string; unit: string; icon: LucideIcon; hint: string }
> = {
  BP: {
    label: 'রক্তচাপ',
    shortLabel: 'রক্তচাপ',
    unit: 'mmHg',
    icon: HeartPulse,
    hint: 'যেমন ১২০/৮০',
  },
  GLUCOSE: {
    label: 'রক্তে শর্করা',
    shortLabel: 'শর্করা',
    unit: 'mmol/L',
    icon: Droplet,
    hint: 'যেমন ৬.৫',
  },
  WEIGHT: { label: 'ওজন', shortLabel: 'ওজন', unit: 'কেজি', icon: Scale, hint: 'যেমন ৬৫.৫' },
  PULSE: { label: 'পালস', shortLabel: 'পালস', unit: 'বার/মিনিট', icon: Activity, hint: 'যেমন ৭২' },
  TEMP: {
    label: 'তাপমাত্রা',
    shortLabel: 'জ্বর',
    unit: '°সে',
    icon: Thermometer,
    hint: 'যেমন ৩৭.০',
  },
  SPO2: {
    label: 'অক্সিজেন (SpO₂)',
    shortLabel: 'অক্সিজেন',
    unit: '%',
    icon: Wind,
    hint: 'যেমন ৯৮',
  },
};

export const VITAL_STATUS_META: Record<VitalStatus, { label: string; tone: PillTone }> = {
  NORMAL: { label: 'স্বাভাবিক', tone: 'success' },
  CONTROLLED: { label: 'সীমার কাছে', tone: 'warning' },
  HIGH: { label: 'বেশি', tone: 'danger' },
  LOW: { label: 'কম', tone: 'danger' },
};

export const GLUCOSE_CONTEXT_LABELS: Record<VitalContext, string> = {
  FASTING: 'খালি পেটে',
  AFTER_MEAL: 'খাবারের ২ ঘণ্টা পরে',
  RANDOM: 'যেকোনো সময়',
};

/** Healthy range drawn behind the chart. */
export const VITAL_NORMAL_BAND: Partial<Record<VitalType, { min: number; max: number }>> = {
  BP: { min: 90, max: 130 },
  GLUCOSE: { min: 3.9, max: 7.8 },
  PULSE: { min: 60, max: 100 },
  TEMP: { min: 35, max: 37.5 },
  SPO2: { min: 95, max: 100 },
};

/** "১৩৫/৮৫", "৭.২", "৬৮.৫" */
export function formatVitalValue(
  reading: Pick<VitalReadingResponse, 'type' | 'systolic' | 'diastolic' | 'value'>
): string {
  if (reading.type === 'BP') {
    return `${toBanglaDigits(reading.systolic ?? 0)}/${toBanglaDigits(reading.diastolic ?? 0)}`;
  }
  if (reading.value === null) return '—';
  const digits = reading.type === 'PULSE' || reading.type === 'SPO2' ? 0 : 1;
  return formatNumber(reading.value, digits);
}

export const CONDITION_KIND_META: Record<
  ConditionKind,
  { label: string; plural: string; tone: PillTone }
> = {
  CHRONIC: { label: 'দীর্ঘমেয়াদি রোগ', plural: 'দীর্ঘমেয়াদি রোগ', tone: 'warning' },
  ALLERGY: { label: 'অ্যালার্জি', plural: 'অ্যালার্জি', tone: 'danger' },
  SURGERY: { label: 'অপারেশন', plural: 'আগের অপারেশন', tone: 'info' },
};

export const FILE_TYPE_LABELS: Record<MedicalFileType, string> = {
  LAB_REPORT: 'ল্যাব রিপোর্ট',
  PRESCRIPTION_SCAN: 'প্রেসক্রিপশন',
  IMAGING: 'এক্স-রে / স্ক্যান',
  OTHER: 'অন্যান্য',
};
