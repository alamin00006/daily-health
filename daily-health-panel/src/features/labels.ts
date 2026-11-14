import type { UserRole } from "@/shared-contracts/auth.contract";
import type { TipCategory } from "@/shared-contracts/content.contract";
import type { EmergencyStatus, EmergencyType } from "@/shared-contracts/emergency.contract";
import type { DoseUnit, MealTiming, MedicineForm } from "@/shared-contracts/medicine.contract";
import type { PrescriptionStatus } from "@/shared-contracts/prescription.contract";
import type { ConsultStatus, QuickConsultKind } from "@/shared-contracts/consultation.contract";
import type { AppointmentStatus } from "@/shared-contracts/appointments.contract";
import type {
  ConsultationMode,
  ProviderType,
  VerificationDocType,
  VerificationStatus,
} from "@/shared-contracts/doctors.contract";

export const MODE_LABEL: Record<ConsultationMode, string> = {
  IN_PERSON: "চেম্বার",
  VIDEO: "ভিডিও কল",
  CHAT: "চ্যাট",
  HOME_VISIT: "হোম ভিজিট",
};

export const STATUS_LABEL: Record<AppointmentStatus, string> = {
  PENDING_PAYMENT: "পেমেন্টের অপেক্ষায়",
  CONFIRMED: "নিশ্চিত",
  COMPLETED: "দেখা হয়েছে",
  CANCELLED: "বাতিল",
  NO_SHOW: "আসেননি",
  EXPIRED: "মেয়াদ শেষ",
};

export const STATUS_TONE: Record<AppointmentStatus, "primary" | "warning" | "success" | "danger" | "neutral"> = {
  PENDING_PAYMENT: "warning",
  CONFIRMED: "primary",
  COMPLETED: "success",
  CANCELLED: "danger",
  NO_SHOW: "neutral",
  EXPIRED: "neutral",
};

export const PROVIDER_TYPE_LABEL: Record<ProviderType, string> = {
  DOCTOR: "ডাক্তার",
  NUTRITIONIST: "পুষ্টিবিদ",
  PHYSIO: "ফিজিওথেরাপিস্ট",
};

export const VERIFICATION_LABEL: Record<VerificationStatus, string> = {
  PENDING: "যাচাইয়ের অপেক্ষায়",
  VERIFIED: "যাচাই করা",
  REJECTED: "সংশোধন দরকার",
};

export const DOC_TYPE_LABEL: Record<VerificationDocType, string> = {
  BMDC_CERT: "BMDC নিবন্ধন সনদ",
  NID: "জাতীয় পরিচয়পত্র",
  DEGREE: "ডিগ্রির সনদ",
  OTHER: "অন্যান্য",
};

export const GENDER_LABEL = { MALE: "পুরুষ", FEMALE: "নারী", OTHER: "অন্যান্য" } as const;

/** "ডা. ফারহানা ইসলাম" for doctors; others without a title. */
export function providerTitle(type: ProviderType, name: string): string {
  return type === "DOCTOR" ? `ডা. ${name}` : name;
}

export const CONSULT_STATUS_LABEL: Record<ConsultStatus, string> = {
  PENDING_PAYMENT: "পেমেন্টের অপেক্ষায়",
  WAITING: "ডাক্তারের অপেক্ষায়",
  ONGOING: "চলছে",
  ENDED: "শেষ",
  MISSED: "ডাক্তার পাওয়া যায়নি",
  CANCELLED: "বাতিল",
  EXPIRED: "মেয়াদ শেষ",
};

export const CONSULT_STATUS_TONE: Record<ConsultStatus, "primary" | "warning" | "success" | "danger" | "neutral"> = {
  PENDING_PAYMENT: "warning",
  WAITING: "warning",
  ONGOING: "primary",
  ENDED: "success",
  MISSED: "danger",
  CANCELLED: "neutral",
  EXPIRED: "neutral",
};

export const QUICK_KIND_LABEL: Record<QuickConsultKind, string> = {
  GENERAL: "সাধারণ দ্রুত পরামর্শ",
  WOMENS_HEALTH: "নারীস্বাস্থ্য দ্রুত পরামর্শ",
};

export const MEDICINE_FORM_LABEL: Record<MedicineForm, string> = {
  TABLET: "ট্যাবলেট",
  CAPSULE: "ক্যাপসুল",
  SYRUP: "সিরাপ",
  SUSPENSION: "সাসপেনশন",
  DROPS: "ড্রপ",
  INJECTION: "ইনজেকশন",
  INSULIN: "ইনসুলিন",
  INHALER: "ইনহেলার",
  CREAM: "ক্রিম",
  OINTMENT: "মলম",
  GEL: "জেল",
  SUPPOSITORY: "সাপোজিটরি",
  POWDER: "পাউডার",
  OTHER: "অন্যান্য",
};

export const DOSE_UNIT_LABEL: Record<DoseUnit, string> = {
  TABLET: "ট্যাবলেট",
  CAPSULE: "ক্যাপসুল",
  ML: "মি.লি.",
  SPOON: "চামচ",
  DROP: "ফোঁটা",
  PUFF: "পাফ",
  UNIT: "ইউনিট",
  SACHET: "স্যাশে",
  APPLICATION: "বার লাগানো",
};

/** A sensible dose unit for a form (the doctor can change it). */
export const DEFAULT_DOSE_UNIT: Record<MedicineForm, DoseUnit> = {
  TABLET: "TABLET",
  CAPSULE: "CAPSULE",
  SYRUP: "SPOON",
  SUSPENSION: "SPOON",
  DROPS: "DROP",
  INJECTION: "ML",
  INSULIN: "UNIT",
  INHALER: "PUFF",
  CREAM: "APPLICATION",
  OINTMENT: "APPLICATION",
  GEL: "APPLICATION",
  SUPPOSITORY: "UNIT",
  POWDER: "SACHET",
  OTHER: "UNIT",
};

export const MEAL_TIMING_LABEL: Record<MealTiming, string> = {
  BEFORE_MEAL: "খাবারের আগে",
  AFTER_MEAL: "খাবারের পরে",
  WITH_MEAL: "খাবারের সাথে",
  ANY: "যেকোনো সময়",
};

export const PRESCRIPTION_STATUS_LABEL: Record<PrescriptionStatus, string> = {
  DRAFT: "খসড়া",
  ISSUED: "দেওয়া হয়েছে",
  REVOKED: "বাতিল",
};

export const PRESCRIPTION_STATUS_TONE: Record<PrescriptionStatus, "warning" | "success" | "danger"> = {
  DRAFT: "warning",
  ISSUED: "success",
  REVOKED: "danger",
};

// --- Step 10: emergency, health tips, staff ---------------------------------------

export const EMERGENCY_TYPE_LABEL: Record<EmergencyType, string> = {
  AMBULANCE: "অ্যাম্বুলেন্স",
  DOCTOR_CALL: "ডাক্তারের ফোন",
  SOS: "অন্য জরুরি সাহায্য",
};

export const EMERGENCY_STATUS_LABEL: Record<EmergencyStatus, string> = {
  OPEN: "নতুন, কেউ ধরেনি",
  DISPATCHED: "সাহায্য পাঠানো হয়েছে",
  CLOSED: "শেষ",
  CANCELLED: "পরিবার বাতিল করেছে",
};

export const EMERGENCY_STATUS_TONE: Record<EmergencyStatus, "danger" | "warning" | "success" | "neutral"> = {
  OPEN: "danger",
  DISPATCHED: "warning",
  CLOSED: "success",
  CANCELLED: "neutral",
};

export const TIP_CATEGORY_LABEL: Record<TipCategory, string> = {
  GENERAL: "সাধারণ",
  NUTRITION: "পুষ্টি",
  WOMEN: "নারীস্বাস্থ্য",
  CHILD: "শিশুর যত্ন",
  MENTAL: "মানসিক স্বাস্থ্য",
};

export const ROLE_LABEL: Record<UserRole, string> = {
  PATIENT: "রোগী/পরিবার",
  DOCTOR: "ডাক্তার",
  NUTRITIONIST: "পুষ্টিবিদ",
  PHYSIO: "ফিজিওথেরাপিস্ট",
  MODERATOR: "মডারেটর",
  ADMIN: "অ্যাডমিন",
};

export const BLOOD_GROUP_LABEL: Record<string, string> = {
  A_POS: "A+",
  A_NEG: "A−",
  B_POS: "B+",
  B_NEG: "B−",
  AB_POS: "AB+",
  AB_NEG: "AB−",
  O_POS: "O+",
  O_NEG: "O−",
};

// --- HealthStore -----------------------------------------------------------------

export const ORDER_STATUS_LABEL: Record<import("@/shared-contracts/shop.contract").OrderStatus, string> = {
  PENDING_PAYMENT: "পেমেন্টের অপেক্ষায়",
  PLACED: "নতুন অর্ডার",
  CONFIRMED: "নিশ্চিত, প্যাক হচ্ছে",
  DISPATCHED: "ডেলিভারির পথে",
  DELIVERED: "ডেলিভারি হয়েছে",
  CANCELLED: "বাতিল",
  EXPIRED: "পেমেন্ট হয়নি",
  RETURNED: "ফেরত",
};

export const ORDER_STATUS_TONE: Record<
  import("@/shared-contracts/shop.contract").OrderStatus,
  "primary" | "warning" | "success" | "danger" | "neutral"
> = {
  PENDING_PAYMENT: "warning",
  PLACED: "primary",
  CONFIRMED: "primary",
  DISPATCHED: "primary",
  DELIVERED: "success",
  CANCELLED: "danger",
  EXPIRED: "neutral",
  RETURNED: "neutral",
};

export const PRESCRIPTION_CHECK_LABEL: Record<import("@/shared-contracts/shop.contract").PrescriptionCheck, string> = {
  NOT_NEEDED: "প্রেসক্রিপশন লাগবে না",
  AWAITING_PRESCRIPTION: "প্রেসক্রিপশন আসেনি",
  PENDING_REVIEW: "প্রেসক্রিপশন দেখতে হবে",
  APPROVED: "প্রেসক্রিপশন ঠিক আছে",
  REJECTED: "প্রেসক্রিপশন বাতিল",
};

export const PAYMENT_METHOD_LABEL: Record<import("@/shared-contracts/shop.contract").OrderPaymentMethod, string> = {
  ONLINE: "অনলাইন পেমেন্ট",
  CASH_ON_DELIVERY: "ক্যাশ অন ডেলিভারি",
};

export const STOCK_REASON_LABEL: Record<import("@/shared-contracts/shop.contract").StockMovementReason, string> = {
  RESTOCK: "নতুন স্টক",
  ORDER: "অর্ডার",
  ORDER_RELEASED: "অর্ডার বাতিল, স্টকে ফেরত",
  RETURNED: "ফেরত পণ্য",
  ADJUSTMENT: "গণনা ঠিক করা",
  DAMAGED: "নষ্ট",
  EXPIRED_STOCK: "মেয়াদোত্তীর্ণ",
};

export const CATEGORY_BADGE_LABEL: Record<import("@/shared-contracts/shop.contract").CategoryBadge, string> = {
  TRENDING: "Trending",
  MUST_HAVE: "Must have",
  POPULAR: "Popular",
  FEATURED: "Featured",
  BEST_SELLER: "Best seller",
};

export const BANNER_LINK_LABEL: Record<import("@/shared-contracts/shop.contract").BannerLinkType, string> = {
  NONE: "কোথাও যাবে না",
  CATEGORY: "ক্যাটাগরি",
  PRODUCT: "পণ্য",
  BRAND: "ব্র্যান্ড",
  URL: "ওয়েব লিংক",
};
