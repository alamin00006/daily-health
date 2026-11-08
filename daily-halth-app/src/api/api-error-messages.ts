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
};

const FALLBACK = 'কিছু একটা সমস্যা হয়েছে। একটু পরে আবার চেষ্টা করুন।';

export function apiErrorMessage(error: unknown): string {
  if (!isApiError(error)) return FALLBACK;
  return MESSAGES[error.code]?.(error) ?? FALLBACK;
}
