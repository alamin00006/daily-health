import type { PillTone } from '@/components/ui/status-pill';
import type { EmergencyStatus, EmergencyType } from '@/shared-contracts/emergency.contract';

export const EMERGENCY_TYPE_META: Record<EmergencyType, { label: string; hint: string }> = {
  AMBULANCE: { label: 'অ্যাম্বুলেন্স দরকার', hint: 'রোগীকে হাসপাতালে নিতে হবে' },
  DOCTOR_CALL: { label: 'ডাক্তারের সাথে এখনই কথা', hint: 'ফোনে পরামর্শ দরকার' },
  SOS: { label: 'অন্য জরুরি সাহায্য', hint: 'পড়ে গেছেন, অজ্ঞান, বা অন্য বিপদ' },
};

export const EMERGENCY_STATUS_META: Record<EmergencyStatus, { label: string; tone: PillTone }> = {
  OPEN: { label: 'সাহায্যের অপেক্ষায়', tone: 'danger' },
  DISPATCHED: { label: 'সাহায্য আসছে', tone: 'warning' },
  CLOSED: { label: 'শেষ হয়েছে', tone: 'success' },
  CANCELLED: { label: 'বাতিল', tone: 'neutral' },
};

/** "+8801711000111" → "01711-000111" for reading and dialing. */
export function localPhone(e164: string): string {
  const local = e164.replace(/^\+88/, '');
  return `${local.slice(0, 5)}-${local.slice(5)}`;
}
