import {
  Activity,
  Apple,
  Baby,
  Bone,
  Brain,
  BrainCircuit,
  Building2,
  Droplet,
  Ear,
  Eye,
  Filter,
  HeartPulse,
  House,
  MessageSquareText,
  PersonStanding,
  Scale,
  Smile,
  SmilePlus,
  Sparkles,
  Stethoscope,
  Video,
  type LucideIcon,
} from 'lucide-react-native';

import { toBanglaDigits } from '@/lib/bangla-digits';
import type {
  AppointmentStatus,
  FollowUpMode,
} from '@/shared-contracts/appointments.contract';
import type { ConsultationMode, ProviderType } from '@/shared-contracts/doctors.contract';

export const MODE_LABEL: Record<ConsultationMode, string> = {
  IN_PERSON: 'চেম্বারে',
  VIDEO: 'ভিডিও কল',
  CHAT: 'চ্যাট',
  HOME_VISIT: 'হোম ভিজিট',
};

export const MODE_ICON: Record<ConsultationMode, LucideIcon> = {
  IN_PERSON: Building2,
  VIDEO: Video,
  CHAT: MessageSquareText,
  HOME_VISIT: House,
};

export const FOLLOW_UP_MODE_LABEL: Record<FollowUpMode, string> = {
  IN_PERSON: 'চেম্বারে',
  VIDEO: 'ভিডিও কল',
  HOME_VISIT: 'হোম ভিজিট',
};

export const STATUS_LABEL: Record<AppointmentStatus, string> = {
  PENDING_PAYMENT: 'পেমেন্ট বাকি',
  CONFIRMED: 'নিশ্চিত',
  COMPLETED: 'দেখানো হয়েছে',
  CANCELLED: 'বাতিল',
  NO_SHOW: 'যাওয়া হয়নি',
  EXPIRED: 'মেয়াদ শেষ',
};

export const STATUS_TONE: Record<
  AppointmentStatus,
  'success' | 'warning' | 'danger' | 'info' | 'neutral'
> = {
  PENDING_PAYMENT: 'warning',
  CONFIRMED: 'info',
  COMPLETED: 'success',
  CANCELLED: 'danger',
  NO_SHOW: 'neutral',
  EXPIRED: 'neutral',
};

export const PROVIDER_TYPE_LABEL: Record<ProviderType, string> = {
  DOCTOR: 'ডাক্তার',
  NUTRITIONIST: 'পুষ্টিবিদ',
  PHYSIO: 'ফিজিওথেরাপিস্ট',
};

/** The API sends lucide icon names (Specialty.iconName). */
const SPECIALTY_ICONS: Record<string, LucideIcon> = {
  stethoscope: Stethoscope,
  'heart-pulse': HeartPulse,
  baby: Baby,
  smile: Smile,
  droplet: Droplet,
  sparkles: Sparkles,
  bone: Bone,
  brain: Brain,
  'brain-circuit': BrainCircuit,
  ear: Ear,
  eye: Eye,
  activity: Activity,
  filter: Filter,
  'smile-plus': SmilePlus,
  apple: Apple,
  scale: Scale,
  'person-standing': PersonStanding,
};

export function specialtyIcon(name: string): LucideIcon {
  return SPECIALTY_ICONS[name] ?? Stethoscope;
}

/** "ডা. ফারহানা ইসলাম" for doctors; others without a title. */
export function providerTitle(type: ProviderType, name: string): string {
  return type === 'DOCTOR' ? `ডা. ${name}` : name;
}

/** "৳১,২০০" */
export function taka(amount: number): string {
  const whole = Math.round(amount)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `৳${toBanglaDigits(whole)}`;
}

/** "৪.৮" or null when there are no reviews yet. */
export function ratingText(avg: number, count: number): string | null {
  return count > 0 ? toBanglaDigits(avg.toFixed(1)) : null;
}
