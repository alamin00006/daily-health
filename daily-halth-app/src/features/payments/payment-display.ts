import type {
  PaymentMethod,
  PaymentStatus,
  RefundStatus,
} from '@/shared-contracts/payments.contract';

export const METHOD_LABEL: Record<PaymentMethod, string> = {
  BKASH: 'বিকাশ',
  NAGAD: 'নগদ',
  ROCKET: 'রকেট',
  UPAY: 'উপায়',
  CARD: 'কার্ড',
  OTHER: 'অন্যান্য',
};

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  INITIATED: 'অপেক্ষমাণ',
  SUCCESS: 'সফল',
  FAILED: 'ব্যর্থ',
  CANCELLED: 'বাতিল',
  REFUNDED: 'টাকা ফেরত',
  PARTIALLY_REFUNDED: 'আংশিক ফেরত',
};

export const PAYMENT_STATUS_TONE: Record<
  PaymentStatus,
  'success' | 'warning' | 'danger' | 'info' | 'neutral'
> = {
  INITIATED: 'warning',
  SUCCESS: 'success',
  FAILED: 'danger',
  CANCELLED: 'neutral',
  REFUNDED: 'info',
  PARTIALLY_REFUNDED: 'info',
};

export const REFUND_STATUS_TEXT: Record<RefundStatus, string> = {
  REQUESTED: 'টাকা ফেরতের প্রক্রিয়া চলছে (সাধারণত ৩–৭ কর্মদিবস)',
  PROCESSED: 'টাকা ফেরত পাঠানো হয়েছে',
  FAILED: 'টাকা ফেরতে সমস্যা হয়েছে; আমাদের টিম যোগাযোগ করবে',
};

export const GATEWAY_LABEL = { SHURJOPAY: 'shurjoPay', SSLCOMMERZ: 'SSLCommerz' } as const;
