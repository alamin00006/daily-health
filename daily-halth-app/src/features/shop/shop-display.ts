import type {
  CategoryBadge,
  OrderPaymentMethod,
  OrderStatus,
  PrescriptionCheck,
} from '@/shared-contracts/shop.contract';

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export const ORDER_STATUS_TEXT: Record<OrderStatus, string> = {
  PENDING_PAYMENT: 'পেমেন্ট বাকি',
  PLACED: 'অর্ডার নেওয়া হয়েছে',
  CONFIRMED: 'প্যাক করা হচ্ছে',
  DISPATCHED: 'ডেলিভারির পথে',
  DELIVERED: 'ডেলিভারি হয়েছে',
  CANCELLED: 'বাতিল',
  EXPIRED: 'পেমেন্ট হয়নি',
  RETURNED: 'ফেরত',
};

export const ORDER_STATUS_TONE: Record<OrderStatus, Tone> = {
  PENDING_PAYMENT: 'warning',
  PLACED: 'info',
  CONFIRMED: 'info',
  DISPATCHED: 'info',
  DELIVERED: 'success',
  CANCELLED: 'danger',
  EXPIRED: 'neutral',
  RETURNED: 'neutral',
};

export const PAYMENT_METHOD_TEXT: Record<OrderPaymentMethod, string> = {
  ONLINE: 'অনলাইন পেমেন্ট (বিকাশ, নগদ, কার্ড)',
  CASH_ON_DELIVERY: 'ক্যাশ অন ডেলিভারি',
};

export const PRESCRIPTION_CHECK_TEXT: Record<PrescriptionCheck, string> = {
  NOT_NEEDED: '',
  AWAITING_PRESCRIPTION: 'প্রেসক্রিপশন দিন',
  PENDING_REVIEW: 'প্রেসক্রিপশন দেখা হচ্ছে',
  APPROVED: 'প্রেসক্রিপশন ঠিক আছে',
  REJECTED: 'প্রেসক্রিপশন গ্রহণ করা যায়নি',
};

export const CATEGORY_BADGE_TEXT: Record<CategoryBadge, string> = {
  TRENDING: 'Trending',
  MUST_HAVE: 'Must have',
  POPULAR: 'Popular',
  FEATURED: 'Featured',
  BEST_SELLER: 'Best seller',
};

/** The order's path, for the progress line on the order screen. */
export const ORDER_STEPS: OrderStatus[] = ['PLACED', 'CONFIRMED', 'DISPATCHED', 'DELIVERED'];
