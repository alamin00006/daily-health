import type { PillTone } from '@/components/ui/status-pill';
import type {
  ConsultationResponse,
  ConsultStatus,
  QuickConsultKind,
} from '@/shared-contracts/consultation.contract';

export const CONSULT_STATUS_LABEL: Record<ConsultStatus, string> = {
  PENDING_PAYMENT: 'পেমেন্ট বাকি',
  WAITING: 'ডাক্তার খোঁজা হচ্ছে',
  ONGOING: 'চলছে',
  ENDED: 'শেষ',
  MISSED: 'ডাক্তার পাওয়া যায়নি',
  CANCELLED: 'বাতিল',
  EXPIRED: 'মেয়াদ শেষ',
};

export const CONSULT_STATUS_TONE: Record<ConsultStatus, PillTone> = {
  PENDING_PAYMENT: 'warning',
  WAITING: 'warning',
  ONGOING: 'primary',
  ENDED: 'success',
  MISSED: 'danger',
  CANCELLED: 'neutral',
  EXPIRED: 'neutral',
};

export const QUICK_KIND_LABEL: Record<QuickConsultKind, string> = {
  GENERAL: 'দ্রুত পরামর্শ',
  WOMENS_HEALTH: 'নারীস্বাস্থ্য পরামর্শ',
};

export const QUICK_KIND_HINT: Record<QuickConsultKind, string> = {
  GENERAL: 'যেকোনো অনলাইন ডাক্তার চ্যাটে উত্তর দেবেন',
  WOMENS_HEALTH: 'শুধু নারী ডাক্তার চ্যাটে উত্তর দেবেন, গোপনীয়ভাবে',
};

/** "ডা. ফারহানা ইসলাম" or a placeholder while waiting. */
export function consultTitle(c: ConsultationResponse): string {
  if (c.provider) return `${c.provider.type === 'DOCTOR' ? 'ডা. ' : ''}${c.provider.displayName}`;
  return c.tier === 'QUICK' ? QUICK_KIND_LABEL[c.quickKind ?? 'GENERAL'] : 'পরামর্শ';
}
