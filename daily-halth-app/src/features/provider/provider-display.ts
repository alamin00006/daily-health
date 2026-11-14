import type { PillTone } from '@/components/ui/status-pill';
import type { VerificationDocType, VerificationStatus } from '@/shared-contracts/doctors.contract';
import type { PrescriptionStatus } from '@/shared-contracts/prescription.contract';

export const VERIFICATION_LABEL: Record<VerificationStatus, string> = {
  PENDING: 'যাচাইয়ের অপেক্ষায়',
  VERIFIED: 'যাচাই করা',
  REJECTED: 'সংশোধন দরকার',
};

export const VERIFICATION_TONE: Record<VerificationStatus, PillTone> = {
  PENDING: 'warning',
  VERIFIED: 'success',
  REJECTED: 'danger',
};

export const DOC_TYPE_LABEL: Record<VerificationDocType, string> = {
  BMDC_CERT: 'BMDC নিবন্ধন সনদ',
  NID: 'জাতীয় পরিচয়পত্র',
  DEGREE: 'ডিগ্রির সনদ',
  OTHER: 'অন্যান্য',
};

export const DOC_STATUS_LABEL: Record<'PENDING' | 'APPROVED' | 'REJECTED', string> = {
  PENDING: 'দেখা হয়নি',
  APPROVED: 'অনুমোদিত',
  REJECTED: 'বাতিল',
};

export const MISSING_LABEL: Record<'BMDC_CERT' | 'CHAMBER_OR_ONLINE_FEE', string> = {
  BMDC_CERT: 'BMDC সনদের ছবি দিন',
  CHAMBER_OR_ONLINE_FEE: 'একটি চেম্বার বা ভিডিও/চ্যাটের ফি দিন',
};

export const PRESCRIPTION_STATUS_LABEL: Record<PrescriptionStatus, string> = {
  DRAFT: 'খসড়া',
  ISSUED: 'দেওয়া হয়েছে',
  REVOKED: 'বাতিল',
};

export const PRESCRIPTION_STATUS_TONE: Record<PrescriptionStatus, PillTone> = {
  DRAFT: 'warning',
  ISSUED: 'success',
  REVOKED: 'danger',
};
