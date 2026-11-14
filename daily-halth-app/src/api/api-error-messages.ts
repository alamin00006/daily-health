import { ApiError, isApiError } from './api-error';

import { toBanglaDigits } from '@/lib/bangla-digits';

const minutes = (seconds: number | null) =>
  toBanglaDigits(Math.max(1, Math.ceil((seconds ?? 60) / 60)));

/**
 * Bangla text for every API error `code` (CLAUDE.md §4: the app maps codes to
 * Bangla; the API's English `message` is never shown). Grouped by module.
 */
const MESSAGES: Record<string, (error: ApiError) => string> = {
  // Connection and general
  NETWORK_ERROR: () => 'ইন্টারনেট সংযোগ পাওয়া যাচ্ছে না। সংযোগ দেখে আবার চেষ্টা করুন।',
  TIMEOUT: () => 'সার্ভার সাড়া দিতে দেরি করছে। একটু পরে আবার চেষ্টা করুন।',
  INVALID_RESPONSE: () => 'সার্ভার থেকে ঠিকমতো উত্তর আসেনি। একটু পরে আবার চেষ্টা করুন।',
  VALIDATION_FAILED: () => 'তথ্যগুলো ঠিকমতো লেখা হয়নি। দেখে আবার চেষ্টা করুন।',
  TOO_MANY_REQUESTS: () => 'অনেকবার চেষ্টা করা হয়েছে। কিছুক্ষণ পরে আবার চেষ্টা করুন।',
  PAYLOAD_TOO_LARGE: () => 'ফাইলটি অনেক বড়। ১০ MB-এর ছোট ফাইল দিন।',
  NOT_FOUND: () => 'খুঁজে পাওয়া যায়নি।',
  FORBIDDEN: () => 'এটি করার অনুমতি আপনার নেই।',
  SERVICE_UNAVAILABLE: () => 'সার্ভিস এখন বন্ধ আছে। একটু পরে আবার চেষ্টা করুন।',
  GUEST_NOT_ALLOWED: () => 'এটি ব্যবহার করতে অ্যাকাউন্ট খুলুন বা লগইন করুন।',

  // Auth
  OTP_INVALID: (e) => {
    const left = e.detailNumber('attemptsLeft');
    return left === null
      ? 'কোডটি সঠিক নয়।'
      : `কোডটি সঠিক নয়। আর ${toBanglaDigits(left)} বার চেষ্টা করতে পারবেন।`;
  },
  OTP_EXPIRED: () => 'কোডের মেয়াদ শেষ হয়ে গেছে। নতুন কোড নিন।',
  OTP_TOO_MANY_ATTEMPTS: () => 'অনেকবার ভুল কোড দেওয়া হয়েছে। নতুন কোড নিন।',
  OTP_RESEND_TOO_SOON: (e) =>
    `${toBanglaDigits(e.detailNumber('retryAfterSec') ?? 60)} সেকেন্ড পরে আবার কোড চাইতে পারবেন।`,
  OTP_SEND_LIMIT_REACHED: (e) =>
    `অনেকবার কোড চাওয়া হয়েছে। ${minutes(e.detailNumber('retryAfterSec'))} মিনিট পরে আবার চেষ্টা করুন।`,
  VERIFICATION_TOKEN_INVALID: () => 'যাচাইয়ের সময় শেষ হয়ে গেছে। আবার কোড নিয়ে যাচাই করুন।',
  EMAIL_ALREADY_REGISTERED: () => 'এই ইমেইলে আগে থেকেই অ্যাকাউন্ট আছে। লগইন করুন।',
  INVALID_CREDENTIALS: () => 'ইমেইল বা পিন সঠিক নয়।',
  PIN_LOCKED: (e) =>
    `অনেকবার ভুল পিন দেওয়া হয়েছে। ${minutes(e.detailNumber('retryAfterSec'))} মিনিট পরে চেষ্টা করুন, অথবা ইমেইল কোড দিয়ে লগইন করুন।`,
  ACCOUNT_SUSPENDED: () => 'আপনার অ্যাকাউন্ট এখন বন্ধ আছে। সহায়তার জন্য আমাদের সাথে যোগাযোগ করুন।',
  REFRESH_TOKEN_INVALID: () => 'আপনার সেশনের মেয়াদ শেষ। আবার লগইন করুন।',
  UNAUTHORIZED: () => 'আবার লগইন করুন।',

  // Profiles and family
  PROFILE_NOT_FOUND: () => 'প্রোফাইলটি পাওয়া যায়নি, অথবা এটি দেখার অনুমতি আপনার নেই।',
  PROFILE_ACCESS_DENIED: () =>
    'এই প্রোফাইলে আপনার ভূমিকায় এটি করা যায় না। মালিকের সাথে কথা বলুন।',
  OWN_PROFILE_ALREADY_EXISTS: () => 'আপনার নিজের প্রোফাইল আগে থেকেই আছে।',
  PROFILE_ALREADY_LINKED: () => 'এই প্রোফাইলটি আগে থেকেই রোগীর নিজের অ্যাকাউন্টের সাথে যুক্ত।',
  MEMBER_NOT_FOUND: () => 'সদস্যকে পাওয়া যায়নি।',
  MEMBER_ALREADY_EXISTS: () => 'তিনি আগে থেকেই এই প্রোফাইলের সদস্য।',
  LAST_OWNER: () => 'প্রোফাইলে অন্তত একজন মালিক থাকতে হবে। আগে আরেকজনকে মালিক করুন।',
  INVITE_NOT_FOUND: () => 'আমন্ত্রণটি পাওয়া যায়নি বা বাতিল হয়ে গেছে।',
  INVITE_ALREADY_PENDING: () => 'এই ইমেইলে আগেই একটি আমন্ত্রণ পাঠানো আছে।',
  INVITE_EXPIRED: () => 'আমন্ত্রণের মেয়াদ (৭ দিন) শেষ হয়ে গেছে। নতুন আমন্ত্রণ চান।',

  // Health profile and records
  VITAL_NOT_FOUND: () => 'মাপটি পাওয়া যায়নি।',
  CONDITION_NOT_FOUND: () => 'তথ্যটি পাওয়া যায়নি।',
  HEALTH_CARD_NOT_FOUND: () => 'হেলথ কার্ড পাওয়া যায়নি বা বন্ধ করা হয়েছে।',
  MEDICAL_FILE_NOT_FOUND: () => 'ফাইলটি পাওয়া যায়নি।',
  FILE_REQUIRED: () => 'একটি ফাইল বেছে নিন।',
  UNSUPPORTED_FILE_TYPE: () => 'শুধু ছবি (JPG, PNG) বা PDF ফাইল দেওয়া যাবে।',
  INVALID_FILE: () => 'ফাইলটি খোলা যাচ্ছে না। অন্য ছবি বা ফাইল দিয়ে চেষ্টা করুন।',

  // Medicine
  MEDICINE_NOT_FOUND: () => 'ওষুধটি তালিকায় পাওয়া যায়নি।',
  MEDICATION_PLAN_NOT_FOUND: () => 'ওষুধটি পাওয়া যায়নি।',
  MEDICATION_PLAN_STOPPED: () => 'এই ওষুধ বন্ধ করা হয়েছে। আবার শুরু করতে নতুন করে যোগ করুন।',
  DOSE_SLOT_NOT_FOUND: () => 'এই সময়ে এই ওষুধের কোনো ডোজ নেই।',
  DOSE_TOO_EARLY: () => 'এই ডোজের সময় এখনো অনেক দেরি।',

  // Notifications
  NOTIFICATION_NOT_FOUND: () => 'বার্তাটি পাওয়া যায়নি।',

  // Doctors
  PROVIDER_NOT_FOUND: () => 'ডাক্তারকে পাওয়া যায়নি বা এখন অ্যাপে নেই।',
  REVIEW_EXISTS: () => 'এই ভিজিটের মতামত আগেই দেওয়া হয়েছে।',

  // Appointments
  APPOINTMENT_NOT_FOUND: () => 'অ্যাপয়েন্টমেন্টটি পাওয়া যায়নি।',
  SESSION_NOT_AVAILABLE: () => 'ওই দিনে ডাক্তার এই সময়ে বসছেন না। অন্য দিন দেখুন।',
  SESSION_FULL: () => 'এই সেশনের সব সিরিয়াল শেষ। অন্য দিন বেছে নিন।',
  SESSION_CLOSED: () => 'এই সেশনের বুকিং বন্ধ হয়ে গেছে। পরের সেশন বেছে নিন।',
  BOOKING_TOO_FAR: () => 'এত আগে বুক করা যায় না (৩০ দিন পর্যন্ত)।',
  SLOT_NOT_AVAILABLE: () => 'এই সময়টি এইমাত্র অন্য কেউ নিয়েছেন। আরেকটি সময় বেছে নিন।',
  ALREADY_BOOKED: () => 'এই রোগীর জন্য এই সেশনে আগেই বুকিং আছে।',
  HOME_ADDRESS_REQUIRED: () => 'হোম ভিজিটের জন্য বাসার ঠিকানা দিন।',
  INVALID_FOLLOW_UP: () => 'আগের ভিজিটটি এই ডাক্তারের সাথে সম্পন্ন হয়নি।',
  APPOINTMENT_STATUS_CONFLICT: () => 'অ্যাপয়েন্টমেন্টের অবস্থা বদলে গেছে। রিফ্রেশ করে দেখুন।',
  TOO_LATE_TO_CANCEL: () => 'ভিজিটের ২ ঘণ্টার কম বাকি, এখন আর বাতিল করা যাবে না। চেম্বারে যোগাযোগ করুন।',
  REVIEW_NOT_ALLOWED: () => 'ভিজিট সম্পন্ন হলে মতামত দিতে পারবেন।',

  // Payments
  PAYMENT_NOT_FOUND: () => 'পেমেন্টটি পাওয়া যায়নি।',
  PAYMENT_NOT_ALLOWED: () => 'এখন আর পেমেন্ট করা যাবে না। বুকিংয়ের সময় শেষ হয়ে থাকলে আবার বুক করুন।',
  ALREADY_PAID: () => 'এর পেমেন্ট আগেই হয়ে গেছে।',
  PAYMENT_GATEWAY_UNAVAILABLE: () => 'পেমেন্ট সার্ভিসে এখন সমস্যা হচ্ছে। একটু পরে আবার চেষ্টা করুন।',
  DEV_PAYMENT_DISABLED: () => 'পরীক্ষামূলক পেমেন্ট এখানে চলবে না।',
  FOLLOW_UP_NOT_FOUND: () => 'ফলো-আপটি পাওয়া যায়নি।',
  FOLLOW_UP_LOCKED: () => 'ডাক্তারের দেওয়া ফলো-আপ বদলানো যায় না; শুধু "হয়ে গেছে" বা বাতিল করা যায়।',

  // Consultations and chat
  CONSULTATION_NOT_FOUND: () => 'পরামর্শটি পাওয়া যায়নি।',
  CONSULTATION_STATUS_CONFLICT: () => 'পরামর্শটি এখন এই অবস্থায় নেই। পাতাটি নিচে টেনে রিফ্রেশ করুন।',
  QUICK_CONSULT_DISABLED: () => 'এই দ্রুত পরামর্শ এখন বন্ধ আছে। পরে আবার চেষ্টা করুন।',
  NO_DOCTOR_ONLINE: () => 'এখন কোনো ডাক্তার অনলাইনে নেই। একটু পরে চেষ্টা করুন বা অ্যাপয়েন্টমেন্ট নিন।',
  QUICK_CONSULT_ALREADY_ACTIVE: () => 'এই প্রোফাইলের একটি দ্রুত পরামর্শ এখনো চলছে। আগে সেটি শেষ করুন।',
  CALL_NOT_STARTED: () => 'ডাক্তার এখনো কল শুরু করেননি। কল এলে ফোনে রিং হবে।',
  NOT_A_CALL: () => 'এটি চ্যাট পরামর্শ, কল নেই।',
  VIDEO_NOT_CONFIGURED: () => 'ভিডিও কল এখনো চালু হয়নি। চ্যাটে কথা বলুন।',
  CONVERSATION_NOT_FOUND: () => 'চ্যাটটি পাওয়া যায়নি।',
  CONVERSATION_CLOSED: () => 'পরামর্শ শেষ, তাই আর বার্তা পাঠানো যাবে না।',

  // Prescriptions
  PRESCRIPTION_NOT_FOUND: () => 'প্রেসক্রিপশনটি পাওয়া যায়নি।',
  PRESCRIPTION_STATUS_CONFLICT: () => 'এই প্রেসক্রিপশন ডাক্তার বাতিল করেছেন। নতুনটি দেখুন।',
  ALARM_ALREADY_CREATED: () => 'এই ওষুধের অ্যালার্ম আগেই চালু করা আছে।',
  PRESCRIPTION_ITEM_NOT_FOUND: () => 'ওষুধটি পাওয়া যায়নি।',
  PRESCRIBED_TEST_NOT_FOUND: () => 'টেস্টটি পাওয়া যায়নি।',
  RESULT_FILE_NOT_FOUND: () => 'রিপোর্টটি এই প্রোফাইলে পাওয়া যায়নি। আগে আপলোড করুন।',

  // Provider (doctor) self-service
  PROVIDER_PROFILE_NOT_FOUND: () => 'আগে সেবাদাতা হিসেবে নিবন্ধন করুন।',
  PROVIDER_PROFILE_EXISTS: () => 'এই অ্যাকাউন্টে আগেই সেবাদাতা প্রোফাইল আছে।',
  BMDC_NUMBER_TAKEN: () => 'এই BMDC নম্বর দিয়ে আগেই নিবন্ধন হয়েছে। ভুল হলে সাপোর্টে জানান।',
  BMDC_NOT_APPLICABLE: () => 'BMDC নম্বর শুধু ডাক্তারদের জন্য।',
  SPECIALTY_NOT_FOUND: () => 'বিশেষজ্ঞতা খুঁজে পাওয়া যায়নি।',
  MODE_FEE_MISSING: () => 'এই ধরনের সেশনের আগে প্রোফাইলে ফি দিন।',
  DOCUMENT_NOT_FOUND: () => 'কাগজটি পাওয়া যায়নি।',
  DOCUMENT_LOCKED: () => 'যাচাই হয়ে যাওয়া কাগজ মোছা যায় না।',
  VERIFICATION_INCOMPLETE: () => 'যাচাইয়ের জন্য কিছু কাগজ বা ফি বাকি আছে।',
  VERIFICATION_NOT_ALLOWED: () => 'এখন যাচাইয়ের জন্য পাঠানো যাবে না।',
  PROVIDER_NOT_VERIFIED: () => 'প্রোফাইল যাচাই হওয়ার পর অনলাইনে যেতে পারবেন।',
  APPOINTMENT_NOT_STARTED: () => 'ভিজিটের সময় এখনো আসেনি।',
  QUICK_CONSULT_TAKEN: () => 'আরেকজন ডাক্তার এটি আগেই নিয়েছেন।',
  QUICK_CONSULT_NOT_ELIGIBLE: () => 'দ্রুত পরামর্শ নিতে অনলাইনে থাকুন আর দ্রুত পরামর্শ চালু রাখুন। নারীস্বাস্থ্যেরটি শুধু নারী ডাক্তাররা নেন।',
  NOT_AN_ONLINE_APPOINTMENT: () => 'শুধু ভিডিও আর চ্যাট অ্যাপয়েন্টমেন্ট অনলাইনে শুরু করা যায়।',
  OUTSIDE_CONSULT_WINDOW: () => 'নির্ধারিত সময়ের ১৫ মিনিট আগে থেকে শুরু করা যাবে।',
  PRESCRIBER_NOT_ALLOWED: () => 'শুধু যাচাই করা ডাক্তার প্রেসক্রিপশন লিখতে পারেন।',
  PRESCRIPTION_SOURCE_INVALID: () => 'নিজের নিশ্চিত বা দেখা হয়ে যাওয়া অ্যাপয়েন্টমেন্ট বা পরামর্শের জন্যই প্রেসক্রিপশন লেখা যায়।',
  PRESCRIPTION_EMPTY: () => 'অন্তত একটি ওষুধ, টেস্ট বা উপদেশ লিখুন।',

  // Emergency and content
  EMERGENCY_CONTACT_NOT_FOUND: () => 'কন্টাক্টটি পাওয়া যায়নি।',
  EMERGENCY_CONTACTS_LIMIT: () => 'সর্বোচ্চ ৫ জন জরুরি কন্টাক্ট রাখা যায়। নতুন কাউকে রাখতে আগে একজনকে বাদ দিন।',
  EMERGENCY_CONTACT_DUPLICATE: () => 'এই নম্বরটি আগে থেকেই কন্টাক্টে আছে।',
  EMERGENCY_REQUEST_NOT_FOUND: () => 'জরুরি অনুরোধটি পাওয়া যায়নি।',
  EMERGENCY_STATUS_CONFLICT: () => 'অনুরোধটির অবস্থা এর মধ্যে বদলে গেছে। আবার দেখুন।',
  HEALTH_TIP_NOT_FOUND: () => 'লেখাটি আর নেই।',

  // Community
  POST_NOT_FOUND: () => 'পোস্টটি আর নেই।',
  ANSWER_NOT_FOUND: () => 'উত্তরটি আর নেই।',
  FORUM_CATEGORY_NOT_FOUND: () => 'বিষয়টি পাওয়া যায়নি।',
  WOMEN_COMMUNITY_MEMBERS_ONLY: () => 'নারী কমিউনিটি শুধু অনুমোদিত সদস্যদের জন্য।',
  WOMEN_COMMUNITY_NOT_ELIGIBLE: () => 'শুধু যাদের নিজের প্রোফাইলে লিঙ্গ নারী দেওয়া, তারাই যোগ দিতে পারেন।',
  WOMEN_COMMUNITY_REQUEST_EXISTS: () => 'আপনার অনুরোধ আগেই পাঠানো হয়েছে।',
  COMMUNITY_BANNED: () => 'কমিউনিটিতে লেখা আপনার জন্য বন্ধ করা হয়েছে।',
  POST_IMAGE_LIMIT: () => 'সর্বোচ্চ ৩টি ছবি দেওয়া যায়।',
  POST_CLOSED: () => 'এই পোস্টে আর উত্তর দেওয়া যাচ্ছে না।',
  ALREADY_REPORTED: () => 'আপনি আগেই রিপোর্ট করেছেন। মডারেটর দেখছেন।',

  // Diet chart
  DIET_PLAN_NOT_FOUND: () => 'ডায়েট চার্টটি পাওয়া যায়নি।',
  DIET_PLAN_APPOINTMENT_INVALID: () => 'এই ভিজিটের জন্য ডায়েট চার্ট দেওয়া যাবে না।',
  DIET_PLAN_EXISTS: () => 'এই ভিজিটের ডায়েট চার্ট আগেই তৈরি হয়েছে।',
  DIET_PLAN_STATUS_CONFLICT: () => 'চার্টটির অবস্থা বদলে গেছে। আবার দেখে নিন।',
  DIET_DAY_NOT_EDITABLE: () => 'শুধু আজ আর আগের ৭ দিনের হিসাব বদলানো যায়।',
  DIET_MEAL_NOT_FOUND: () => 'খাবারটি এই চার্টে আর নেই।',

  // HealthStore
  SHOP_DISABLED: () => 'হেলথস্টোর এখন বন্ধ আছে।',
  PRODUCT_NOT_FOUND: () => 'পণ্যটি আর পাওয়া যাচ্ছে না।',
  PRODUCT_CATEGORY_NOT_FOUND: () => 'ক্যাটাগরিটি পাওয়া যায়নি।',
  BRAND_NOT_FOUND: () => 'ব্র্যান্ডটি পাওয়া যায়নি।',
  DELIVERY_ZONE_NOT_FOUND: () => 'এই এলাকায় এখন ডেলিভারি হচ্ছে না। অন্য এলাকা বেছে নিন।',
  DELIVERY_ADDRESS_NOT_FOUND: () => 'ঠিকানাটি পাওয়া যায়নি।',
  DELIVERY_ADDRESS_LIMIT: () => 'সর্বোচ্চ ১০টি ঠিকানা রাখা যায়। পুরোনো একটি মুছে দিন।',
  ORDER_NOT_FOUND: () => 'অর্ডারটি পাওয়া যায়নি।',
  PRODUCT_UNAVAILABLE: () => 'পণ্যটি এখন এত পরিমাণে নেই।',
  CART_NOT_ORDERABLE: () => 'কার্টের কিছু পণ্য এখন অর্ডার করা যাচ্ছে না। কার্ট দেখে ঠিক করুন।',
  CASH_ON_DELIVERY_UNAVAILABLE: () => 'ক্যাশ অন ডেলিভারি এখন বন্ধ। অনলাইনে পেমেন্ট করুন।',
  ORDER_STEP_NOT_ALLOWED: () => 'অর্ডারটি এখন এই অবস্থায় নেই। আবার দেখুন।',
  PRESCRIPTION_NOT_NEEDED: () => 'এই অর্ডারে প্রেসক্রিপশন লাগবে না।',
  PRESCRIPTION_INVALID: () => 'এটি এই রোগীর ইস্যু করা প্রেসক্রিপশন নয়।',
  PRESCRIPTION_MISSING: () => 'আগে প্রেসক্রিপশন দিতে হবে।',

  // Women's health
  WOMENS_HEALTH_NOT_AVAILABLE: () => 'এই প্রোফাইলে নারীস্বাস্থ্য অংশটি নেই।',
  PERIOD_NOT_FOUND: () => 'পিরিয়ডের তথ্যটি পাওয়া যায়নি।',
  PERIOD_TOO_CLOSE: () => 'এই তারিখের ১০ দিনের মধ্যে আরেকটি পিরিয়ড লেখা আছে। সেটি ঠিক করে নিন।',
  DATE_IN_FUTURE: () => 'আগামী দিনের তারিখ লেখা যাবে না।',
  PERIOD_TOO_LONG: () => 'একটি পিরিয়ড ১৫ দিনের বেশি হতে পারে না। তারিখ দেখে নিন।',
  PREGNANCY_ALREADY_ACTIVE: () => 'গর্ভধারণ আগে থেকেই ট্র্যাক করা হচ্ছে।',
  PREGNANCY_NOT_FOUND: () => 'এখন কোনো গর্ভধারণ ট্র্যাক করা হচ্ছে না।',
  PREGNANCY_LMP_INVALID: () => 'শেষ পিরিয়ডের তারিখ গত ৪২ সপ্তাহের মধ্যে হতে হবে।',
};

const FALLBACK = 'কিছু একটা সমস্যা হয়েছে। একটু পরে আবার চেষ্টা করুন।';

export function apiErrorMessage(error: unknown): string {
  if (!isApiError(error)) return FALLBACK;
  return MESSAGES[error.code]?.(error) ?? FALLBACK;
}
